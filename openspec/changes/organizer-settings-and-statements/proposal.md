# Organizer settings and settlement statements

## Why

Organizations have no profile in TicketBox. Identity stores only an approved name and members (`V8__organizations.sql`), so an organizer cannot add a logo, contact details or the legal name and tax code a finance team needs on a document. Wave 1 gave organizers live sales figures (ADR 0005), but there is still no fixed, numbered record of what a finished performance or event sold, refunded and collected. Finance teams rebuild it by hand from exports. Sales reports also hard-code `Asia/Ho_Chi_Minh`.

This is roadmap item F in the [organizer workflow audit](../../../docs/product/organizer-workflow-audit.md). The approved finance scope is reports plus statements: no payout ledger, no bank accounts and no money movement. TicketBox charges no fees.

## What Changes

- **Organization settings page** at `/organizer/settings`, in the sidebar for every member. It has three sections:
  - **Profile:** logo, contact email, contact phone and website. The approved display name is shown read-only, with a route to ask TicketBox to change it.
  - **Statement details:** legal name, tax code and billing address, printed on statements.
  - **Reporting:** the organization's reporting timezone (default `Asia/Ho_Chi_Minh`), chosen with a searchable picker.
- **Who can edit:** members with `MEMBERS` edit the profile and reporting timezone. Members with `MEMBERS` or `FINANCE` edit statement details. Every active member can read the page. Saves use a version check, show a toast and are audited.
- **Identity owns the profile.** A new `organization_profiles` table, organizer endpoints, logo upload through an Identity-owned image adapter, and an internal profile read for other services.
- **Reporting timezone in sales reports.** Identity adds an optional `reportingTimezone` to the existing organization-access response. Ticketing uses it for organization and event scopes, and falls back to `Asia/Ho_Chi_Minh` when it is absent. A single native performance keeps its own timezone.
- **Settlement statements** in Ticketing for a final performance or a final event:
  - Gross sales, refunds and net sales.
  - Order and ticket counts for sales and refunds.
  - Breakdowns by performance (event statements) and by ticket type.
  - A breakdown by payment provider with the amounts the provider verified from `payment_reconciliation`, and a count of items that are not yet reconciled.
- **Issuing:** a `FINANCE` member issues a statement. It is numbered and immutable, and it stores a snapshot of the organization's statement details and the rendered PDF. If sales or refunds change after issue, the statement is marked out of date and a new revision can be issued. The new revision supersedes the old one, and the old one stays downloadable.
- **Downloads:** PDF and CSV. Statements carry "Platform fee: 0 VND". They label net sales as net sales, not as an amount payable, and state that no money moves through the statement.
- **Reports › Statements** tab for `FINANCE`. It lists eligible performances and events and issued statements, with actions to issue, re-issue and download.

## Capabilities

### New Capabilities

- `organization-settings`: organization profile, statement details and reporting timezone, editable in the organizer workspace under grant rules.
- `settlement-statements`: numbered, immutable sales statements for final performances and events, with revisions and PDF/CSV downloads.

### Modified Capabilities

None. Sales reports keep their requirements. The reporting timezone they use is specified in `organization-settings`.

## Impact

- **Identity:**
  - `V12__organization_profiles.sql`.
  - Profile use cases and an `OrganizationImageStorage` port with a Cloudinary adapter (`CLOUDINARY_*`, folder `ticketbox/organization-logos`).
  - Endpoints `GET/PUT /api/organizations/{id}/profile`, `PUT/DELETE /api/organizations/{id}/profile/logo`, `GET /api/admin/organizations/{id}/profile` and `GET /internal/split/v1/organizations/{id}/profile`.
  - An optional `reportingTimezone` in `/internal/split/v1/organization-access/{id}`.
- **Contracts:**
  - New `identity.organization-profile.v1.json`.
  - An additive, optional `reportingTimezone` in `identity.organization-access.v1.json`.
  - Catalog and Check-in ignore the new field.
- **Ticketing:**
  - `V24__settlement_statements.sql`.
  - A statement read model built from `sales_ledger` and `payment_reconciliation`, a statement service and exporter (OpenPDF, Noto Sans), an `OrganizationProfiles` client and endpoints under `/api/organizer/statements`.
  - The reporting timezone from the access response.
- **Catalog, Check-in, Payment, Notification:** none. The display name keeps reaching Catalog through the existing `/internal/split/v1/organizations/{id}/name`.
- **Web:** `/organizer/settings`, the sidebar entry, Reports › Statements, API clients, and en/vi catalogs.
- **Decision:** [ADR 0007](../../../docs/adr/0007-organization-profile-and-statements.md) (organization profile ownership and settlement statements), Proposed.
