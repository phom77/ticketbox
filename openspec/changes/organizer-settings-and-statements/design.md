# Design

## Context

- **Identity organization data** (`V8__organizations.sql`, `V11__organizer_onboarding.sql`):
  - `organizations(id, name UNIQUE, initial_manager_id)`, `organization_members(grants ⊆ MEMBERS, EVENTS, FINANCE, ADMISSION)` and `organization_audit`.
  - The organizer application stores `organization_name`, `manager_name` and `email` but does not copy them to the organization.
  - The latest Identity migration is `V11`.
- **How other services read organization data today:**
  - Catalog calls `GET /internal/split/v1/organizations/{id}/name` (`IdentityDisplayNames`) to show the organizer on buyer pages, and degrades to no name when Identity is unavailable.
  - Ticketing, Catalog and Check-in call `GET /internal/split/v1/organization-access/{id}` on every organizer request (`OrganizationAccess`) and fail closed.
  - No service copies organization tables.
- **Images:** Catalog stores posters in Cloudinary (`CloudinaryPosterStorage`, `CLOUDINARY_*` env, JPEG/PNG/WebP, 5 MB). Identity has no image storage.
- **Sales data in Ticketing** (ADR 0005, `V20`–`V22`):
  - `sales_ledger` has one `SALE` and one `REFUND` row per order item, with `organization_id`, `event_id`, `performance_id`, `offer_id`, `offer_name`, `section_label`, `quantity`, `amount`, `provider`, `occurred_at` and `recorded_at`.
  - `payment_reconciliation` holds each intent's `provider`, `state`, `collected_amount`, `verified_at`, `refund_amount`, `changed_at` and `received_at` per `order_id`.
  - `JdbcSalesReportStore` already defines when a performance is final, and so no longer provisional. Final means status `COMPLETED`; or `CANCELLED` with no PAID order left; or any other status once its end has passed. The end is `performance_sales.ends_at` for native performances and `event_date + 1 day` for legacy concerts.
  - The latest Ticketing migration is `V22`.
- **Reporting timezone:** `JdbcSalesReportStore.DEFAULT_ZONE` and the old revenue and reconciliation services hard-code `Asia/Ho_Chi_Minh`.
- **Exports:** `SalesReportExportService` renders CSV (UTF-8 BOM, CRLF) and PDF (OpenPDF with `PdfFonts`, Noto Sans).
- **Workspace:** the organizer sidebar (`OperationsLayout.tsx`) gates items by grant. Members (`MEMBERS`) is the last item. Reports already has Sales and Reconciliation views.

## Decisions

### Organization profile (Identity, ADR 0007)

`V12__organization_profiles.sql`:

| Column | Notes |
|---|---|
| `organization_id` | PK, FK `organizations(id)` |
| `logo_url`, `logo_public_id` | both null or both set |
| `contact_email` | ≤ 254, email |
| `contact_phone` | ≤ 32, digits, spaces, `+ - ( )` |
| `website` | ≤ 2048, `https://` only |
| `legal_name` | ≤ 200 |
| `tax_code` | ≤ 20, Vietnamese MST shape: 10 digits or 10 digits `-` 3 digits |
| `billing_address` | ≤ 500 |
| `reporting_timezone` | IANA id, default `Asia/Ho_Chi_Minh`, validated with `ZoneId.of` |
| `version` | bigint, optimistic lock |
| `updated_at`, `updated_by` | |

- No profile row means an empty profile with the default timezone. The first save inserts the row.
- On onboarding approval, `contact_email` is seeded from the application email once. Existing rows are untouched, and the field stays editable.
- The display name stays `organizations.name`, which keeps its uniqueness and the Admin approval flow. Organizers see it read-only (see Open questions).
- Use cases in `organization/application/OrganizationProfiles`:
  - **read:** any active member, or a platform admin through the admin route.
  - **updateProfile:** contact fields and timezone. Needs `MEMBERS`.
  - **updateStatementDetails:** legal name, tax code and billing address. Needs `MEMBERS` or `FINANCE`.
  - **replaceLogo** and **removeLogo:** need `MEMBERS`.
  - Each write takes the expected `version`. A stale version returns 409 with the current profile.
  - Writes add `organization_audit` rows (`PROFILE_UPDATED`, `STATEMENT_DETAILS_UPDATED`, `LOGO_REPLACED`, `LOGO_REMOVED`) with empty grants. The audit records which fields changed, not their values.
- **Logo:**
  - The `OrganizationImageStorage` port has a `CloudinaryOrganizationImageStorage` adapter. It uses the same `CLOUDINARY_*` variables as Catalog and the folder `ticketbox/organization-logos`.
  - Uploads are JPEG, PNG or WebP, up to 2 MB, and at least 128×128.
  - The old image is deleted after commit. A failed upload leaves the profile unchanged.
  - When Cloudinary is not configured, the upload returns 503 with a translated message. The rest of the profile still saves.
- **Endpoints:**

| Endpoint | Access |
|---|---|
| `GET /api/organizations/{id}/profile` | active member |
| `PUT /api/organizations/{id}/profile` | `MEMBERS` (contact + timezone) |
| `PUT /api/organizations/{id}/profile/statement-details` | `MEMBERS` or `FINANCE` |
| `PUT /api/organizations/{id}/profile/logo` (multipart), `DELETE …/logo` | `MEMBERS` |
| `GET /api/admin/organizations/{id}/profile` | platform admin, read-only |
| `GET /internal/split/v1/organizations/{id}/profile` | service token; `identity.organization-profile.v1` |

- Responses are `no-store`. They include `displayName`, `version` and the caller's `canEditProfile` and `canEditStatementDetails`.
- Another organization's id returns 404, the same as an unknown id.

### Contracts

- **`identity.organization-access.v1`** gains an optional `reportingTimezone` (IANA string). The change is additive. Consumers already ignore unknown fields, and Ticketing treats an absent or invalid value as `Asia/Ho_Chi_Minh`.
- **New `identity.organization-profile.v1`** is the response of the internal profile read:
  - `organizationId`, `displayName`, `legalName?`, `taxCode?`, `billingAddress?`, `contactEmail?`, `contactPhone?`, `website?`, `logoUrl?`, `logoPngUrl?`, `reportingTimezone` and `version`.
  - `logoPngUrl` is a Cloudinary PNG rendition, 400 px wide, because OpenPDF cannot embed WebP.
- Contract tests live in Identity (producer) and Ticketing (consumer fixture).

### Reporting timezone in sales reports

- `OrganizationAccess` in Ticketing reads `reportingTimezone` from the access response it already fetches, and stores it as a request attribute.
- `SalesReportService` uses it for organization and event scopes in place of `DEFAULT_ZONE`. A single native performance keeps `performance_sales.timezone`. Legacy performances and exports follow the same rule.
- Every response already states its timezone. The Sales view shows it next to the period picker, with a link to Settings for members with `MEMBERS`.
- A changed timezone applies to the next request. Issued statements keep the timezone they were issued with.
- The deprecated revenue endpoints and reconciliation keep `Asia/Ho_Chi_Minh`. They are out of scope and due for removal.

### Settlement statements (Ticketing, ADR 0007)

**Scope and eligibility**

- A statement covers one performance or one event (all its performances), for all time up to the issue cutoff.
- A performance is eligible when it is final, using the existing provisional rule from `JdbcSalesReportStore`.
- An event is eligible when all its performances in Ticketing, except `DRAFT` ones, are final and at least one exists.
- Zero-sales statements are allowed.
- Scope must belong to the selected organization. Another organization's ids return 404.

**Model**

`V23__settlement_statements.sql` (renumbered to the next free version at build time):

```
settlement_statements(
  id uuid PK, organization_id uuid NOT NULL, scope_type text CHECK IN ('PERFORMANCE','EVENT'),
  scope_id uuid NOT NULL, event_id uuid NOT NULL, number text UNIQUE NOT NULL, revision int NOT NULL,
  supersedes_id uuid NULL REFERENCES settlement_statements(id), status text CHECK IN ('CURRENT','SUPERSEDED'),
  timezone text NOT NULL, cutoff_at timestamptz NOT NULL, issued_at timestamptz NOT NULL, issued_by uuid NOT NULL,
  organization_snapshot jsonb NOT NULL,            -- display name, legal name, tax code, address, contacts
  scope_snapshot jsonb NOT NULL,                   -- event and performance titles, dates, venue
  gross_sales, refunds, net_sales numeric(12,0) NOT NULL,
  sale_orders, refund_orders, tickets_sold, tickets_refunded int NOT NULL,
  verified_collected, verified_refunded numeric(12,0) NOT NULL, unreconciled_orders int NOT NULL,
  pdf bytea NOT NULL, pdf_sha256 text NOT NULL,
  UNIQUE (organization_id, scope_type, scope_id, revision))
CREATE UNIQUE INDEX one_current_statement ON settlement_statements(organization_id, scope_type, scope_id) WHERE status = 'CURRENT';
settlement_statement_lines(statement_id FK, kind CHECK IN ('PERFORMANCE','OFFER','PROVIDER'), sort int,
  label text, key uuid NULL, provider text NULL, tickets_sold, tickets_refunded int,
  gross_sales, refunds, net_sales, verified_collected, verified_refunded numeric(12,0), sale_orders, refund_orders int)
```

- The runtime role gets `INSERT` on both tables. `UPDATE` is allowed only on `status`, through a column grant, which is how a statement is superseded. `DELETE` is revoked, following the `sales_ledger` pattern.

**Figures**

- **Sales and refunds:** from `sales_ledger` rows in scope with `recorded_at <= cutoff_at`. Signs and definitions follow ADR 0005, so a statement equals the all-time Sales report for the same scope at the cutoff.
- **Order counts:** distinct `order_id` per kind.
- **Provider lines:** grouped by `sales_ledger.provider`.
  - Verified collected is `SUM(collected_amount)` of `payment_reconciliation` rows with `verified_at IS NOT NULL` for orders with a `SALE` row in scope.
  - Verified refunded is `SUM(refund_amount)` for those orders.
  - Both count only rows with `received_at <= cutoff_at`.
- **Unreconciled orders:** orders in scope whose ledger amount differs from their verified amount, or that have no verified row. The statement shows the count and a link to Reconciliation filtered to the scope. It does not block issue.
- **Complimentary orders** (0 VND) count as tickets with no revenue, as in the Sales report.
- **Header:** "Platform fee: 0 VND". A footer states that the statement records sales and refunds processed by TicketBox and is not an invoice, payout or transfer.

**Issue flow** (`POST /api/organizer/statements`, `FINANCE`)

1. Body: `{scopeType, scopeId, expectedRevision}`. `expectedRevision` is 0 for the first issue.
2. Check scope ownership and eligibility. An ineligible scope returns 409 `statement.not-final` with the reason (not ended, refunds pending).
3. Fetch the organization profile from Identity through the `OrganizationProfiles` port (`identity.organization-profile.v1`). Identity unavailable returns 503 `statement.profile-unavailable`, and nothing is written.
4. Fetch `logoPngUrl` with a 3 s timeout and a 1 MB cap, only from the configured Cloudinary host. On failure the PDF is rendered without a logo and the response says so.
5. In one transaction:
   - Take an advisory lock on (organization, scope).
   - Compare the current revision with `expectedRevision`. A mismatch returns 409 with the current statement, which also makes a double click idempotent.
   - Compute figures at `cutoff_at = now()`.
   - Render the PDF and insert the statement and its lines.
   - Mark the previous revision `SUPERSEDED`.
6. Numbering: `TBS-<yyyy>-<6-digit global sequence>`, with `-R<n>` for revisions from 2.

**Out of date**

- A current statement is out of date when ledger rows exist for its scope with `recorded_at > cutoff_at`, or reconciliation rows for its orders with `received_at > cutoff_at`.
- This is computed on read and never stored. The list shows "Out of date: sales or refunds changed after issue" with a Re-issue action.

**Endpoints** (`X-Organization-Id`, `no-store`)

| Endpoint | Access | Returns |
|---|---|---|
| `GET /api/organizer/statements/eligible?q=&page=&size=` | `FINANCE` | final performances and events with no current statement, or an out-of-date one |
| `GET /api/organizer/statements?eventId=&page=&size=` | `FINANCE` | issued statements, all revisions, newest first, with `outOfDate` |
| `GET /api/organizer/statements/{id}` | `FINANCE` | header, totals, lines |
| `POST /api/organizer/statements` | `FINANCE` | issue or re-issue |
| `GET /api/organizer/statements/{id}/download?format=pdf|csv` | `FINANCE` | stored PDF bytes; CSV rendered from the stored rows |

- The CSV has a header block (number, revision, organization, scope, timezone and cutoff), the totals, then the lines by kind.
- A superseded revision is labelled "Superseded by …" in both formats.

### Web

- **`/organizer/settings`:**
  - A sidebar item for every member, after Members.
  - Three cards: Profile, Statement details and Reporting. Each saves on its own with a version check, shows a toast on success and validation inline.
  - Fields the caller cannot edit are read-only, with a line naming the grant needed.
  - The logo field reuses the poster field pattern with a square crop preview.
  - The timezone uses the searchable picker with the current offset shown.
  - A 409 reloads the card with "Someone else saved changes; review and save again".
- **Reports › Statements** (`?view=statements`, `FINANCE`):
  - An "Ready for a statement" list (eligible) and an "Issued statements" list (paged, filter by event).
  - Each row shows the number, revision, scope, issued date, net sales, an out-of-date badge and the unreconciled count with a Reconciliation link.
  - Actions: Issue, Re-issue, Download PDF and Download CSV.
  - Before the first issue, a confirmation shows the statement details that will be printed. A missing legal name or tax code shows a warning and a link to Settings, and issue is still allowed.
- en/vi catalog entries for all new text. Component tests for the grant-dependent rendering.

## Defaults to confirm in review

- The reporting timezone default is `Asia/Ho_Chi_Minh`, and any IANA zone can be chosen.
- A `FINANCE` member issues statements by hand. Nothing is issued automatically when a performance becomes final.
- Statements can be issued with unreconciled orders. They show the count and link to Reconciliation.
- A statement can be issued without a legal name or tax code, after a warning. The display name is printed instead.
- The tax code format is checked against the MST shape (10 or 13 digits), with no lookup against the tax authority.
- Platform admins can read an organization's profile but have no statements view in this change.
- The contact email is seeded from the organizer application on approval.
- The PDF is stored per statement (`bytea`, about 50–150 KB). The CSV is rendered on download.

## Risks

- **Identity unavailable at issue time.** Issue returns 503 and writes nothing. Reading and downloading issued statements do not need Identity, because the header is a snapshot.
- **Late refunds after issue.** A refund request approved after the event ends adds ledger rows. The statement shows as out of date and a revision supersedes it, so the old figures stay downloadable and traceable.
- **The logo fetch is outbound HTTP from Ticketing.** It is limited to the configured Cloudinary host, a 1 MB cap and a 3 s timeout, and a failure never blocks issue.
- **Large events.** Figures are aggregated through the existing `sales_ledger` indexes (`event_id`, `performance_id`). The reconciliation join is limited to the scope's order ids. A test with 100,000 ledger rows for one event records the issue time.
- **Timezone change mid-period.** Sales reports are recomputed with the new zone. Earlier exports keep the zone printed on them.

## Rollout

1. Identity: deploy `V12`, the profile endpoints and the optional `reportingTimezone` in the access response. Existing consumers are unaffected.
2. Ticketing: deploy the timezone handling with the `Asia/Ho_Chi_Minh` fallback, then `V23` and the statement endpoints.
3. Web: Settings page, then Reports › Statements.
4. Rollback: the web entries can be hidden. The tables are additive, and the access field is optional.

## Open questions

1. **Can organizers rename their organization?** Recommended: no. The display name stays Admin-controlled and is shown read-only with a "contact TicketBox" route. Reason: the name was vetted at approval, is unique, and appears on buyer pages, so self-service renames create an impersonation risk with no review queue.
2. **Are statements issued, numbered and immutable with revisions, or rendered live on every download?** Recommended: issued and immutable, with superseding revisions. Reason: finance teams need a document whose figures do not change after they have filed it, and the out-of-date flag still surfaces late refunds.
3. **Where are organization logos stored?** Recommended: Identity gets its own Cloudinary adapter, using the same account in a separate folder. Reason: it keeps profile data and its images in the owning service with no cross-service upload path, and it reuses the operational setup Catalog already has.
4. **Who edits statement details (legal name, tax code, billing address)?** Recommended: members with `MEMBERS` or `FINANCE`; the rest of the profile needs `MEMBERS`. Reason: finance staff own the legal details printed on statements but should not need member-management rights to fix them.

## Decisions confirmed by the product owner (2026-11-27)

The product owner accepted the recommended answer to every open question:

- The organization display name stays Admin-controlled.
- Statements are issued, numbered and immutable, with superseding revisions.
- Identity stores logos in its own Cloudinary folder.
- Statement details are editable by `MEMBERS` or `FINANCE`. The rest of the profile is editable by `MEMBERS`.
- The organization reporting timezone is used by sales reports.
- ADR 0007 is accepted.
- Migration numbers: Identity `V12`, Ticketing `V24`.
