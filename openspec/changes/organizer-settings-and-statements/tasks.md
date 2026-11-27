# Tasks

## 1. Decision

- [ ] 1.1 Accept ADR 0007 (organization profile ownership and settlement statements) and record the product owner's answers to the open questions in `design.md`.

## 2. Contracts

- [ ] 2.1 Add the optional `reportingTimezone` to `contracts/identity.organization-access.v1.json` and create `contracts/identity.organization-profile.v1.json`. Run the boundary gate's contract checks (`python3 scripts/ci/verify-service-boundaries.py --service identity` and `--service ticketing`). Confirm that Catalog and Check-in deserialize the access response with the new field present (an existing access test with an extra field).

## 3. Identity

- [ ] 3.1 `V12__organization_profiles.sql` (table, checks, version). Seed `contact_email` from the application email on approval. Flyway migration test on an existing database.
- [ ] 3.2 `OrganizationProfiles` use cases with grant rules (`MEMBERS` for profile, logo and timezone; `MEMBERS` or `FINANCE` for statement details), validation, version conflict and audit of changed field names. Unit tests for validation and each grant combination.
- [ ] 3.3 `OrganizationImageStorage` port and Cloudinary adapter (folder `ticketbox/organization-logos`, 2 MB, ≥128 px, after-commit delete, 503 when not configured). Integration tests for rollback on upload failure and cleanup after commit.
- [ ] 3.4 Endpoints `GET/PUT /api/organizations/{id}/profile`, `PUT …/statement-details`, `PUT/DELETE …/logo`, `GET /api/admin/organizations/{id}/profile` and internal `GET /internal/split/v1/organizations/{id}/profile`. Add `reportingTimezone` to the access response. HTTP tests: another organization returns 404, a locked account or removed grant is denied on the next request, the internal route needs the service token, `no-store`.
- [ ] 3.5 Update `ArchitectureTest` if packages change, `scripts/ci/java-suites.json` (an `organization-profile` group), `docs/api.md` and the Identity `GLOSSARY.md` (organization profile, statement details, reporting timezone). Add the logo folder variable to `.env.example` and Compose.

## 4. Ticketing

- [ ] 4.1 `OrganizationAccess` reads `reportingTimezone` into a request attribute. `SalesReportService` and the sales exporter use it for organization and event scopes, with the `Asia/Ho_Chi_Minh` fallback. Tests: another zone moves bucket boundaries; a native performance scope keeps its own zone; a missing or invalid value falls back.
- [ ] 4.2 `V23__settlement_statements.sql` (or the next free number), using the runtime role pattern from `sales_ledger` (insert-only, update limited to `status`, no delete), the global number sequence and the one-current partial unique index.
- [ ] 4.3 `OrganizationProfiles` port and Identity client (`identity.organization-profile.v1`, service token, fail on unavailability), plus the logo fetcher (Cloudinary host allowlist, 3 s, 1 MB, PNG/JPEG). Consumer contract test against a fixture.
- [ ] 4.4 Statement read model and `SettlementStatementService`: eligibility (reuse the provisional rule), figures from `sales_ledger` and `payment_reconciliation` at the cutoff, provider lines, unreconciled count, advisory lock with `expectedRevision`, supersede, out-of-date check on read. Integration tests: performance and event scopes, a refund before and after issue, a concurrent issue (one revision), Identity down (nothing written), another organization's ids, zero sales, and a statement total equal to the all-time Sales summary at the cutoff.
- [ ] 4.5 PDF and CSV rendering for statements (OpenPDF, `PdfFonts`, logo optional, "Platform fee: 0 VND" and the no-money-movement footer). Stored PDF bytes and SHA-256. Extend `VietnamesePdfTest`, and test byte-identical repeat downloads and CSV/PDF parity.
- [ ] 4.6 `/api/organizer/statements` endpoints (`FINANCE`): eligible, list, detail, issue, download. HTTP tests for each grant, `no-store`, unsupported format, 409 bodies.
- [ ] 4.7 Large-data test: 100,000 ledger rows for one event, recording the issue time. Add the statement suites to `scripts/ci/java-suites.json`. Update `docs/api.md` and the Ticketing `GLOSSARY.md` (settlement statement, revision, cutoff, out of date).

## 5. Web

- [ ] 5.1 API clients `api/organizationProfile.ts` and `api/statements.ts`, exported through the management index where appropriate.
- [ ] 5.2 `/organizer/settings` page with Profile, Statement details and Reporting cards, logo field with square crop preview, searchable timezone picker, read-only states naming the needed grant, toasts, inline validation and conflict reload. Sidebar entry for all members.
- [ ] 5.3 Reports › Statements view (`?view=statements`, `FINANCE`): eligible list, issued list with filter and paging, out-of-date badge, unreconciled link, issue confirmation with statement details preview and missing-details warning, re-issue, PDF and CSV downloads. Loading, empty, error and permission states.
- [ ] 5.4 Sales view shows the reporting timezone with a Settings link for `MEMBERS`.
- [ ] 5.5 en/vi catalog entries. Component tests for grant-dependent rendering, conflict handling and the issue confirmation.

## 6. Verification

- [ ] 6.1 `./mvnw -B -ntp -f services/identity/pom.xml verify` and `-f services/ticketing/pom.xml verify` (or `scripts/mvnw-docker.sh`). `python3 scripts/ci/verify-service-boundaries.py --service identity` and `--service ticketing`. `npm --prefix frontend run lint`, `test` and `build`.
- [ ] 6.2 Compose walk-through on an isolated project:
  - As `MEMBERS`: set a logo, contacts and the `Asia/Bangkok` timezone. As `FINANCE` only: set the legal name and tax code, and confirm the profile is read-only.
  - Check that Reports › Sales states the new timezone.
  - Buy tickets for a performance and let it end. Issue a statement, refund an order, see the statement out of date, re-issue it, and download PDF and CSV for both revisions.
  - As `EVENTS` only: confirm Statements is unavailable.
  - Take screenshots at 1440, 834 and 390 px.
- [ ] 6.3 `openspec validate organizer-settings-and-statements --type change --strict`.
