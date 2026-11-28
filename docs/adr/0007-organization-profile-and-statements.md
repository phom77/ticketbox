# ADR 0007: Organization profile ownership and settlement statements

- **Status:** Accepted (organizer-settings-and-statements, approved by the product owner on 2026-11-27)
- **Date:** 2026-11-27

## Context

Organizations need a profile (logo, contacts, legal name, tax code and reporting timezone) and a fixed record of what a finished performance or event sold, refunded and collected. Identity owns organizations and membership (ADR 0002) but stores only a name. Ticketing owns the sales ledger (ADR 0005) and the copy of payment reconciliation results. Catalog already reads the organization name from Identity through an internal endpoint, and every organizer request already calls Identity's organization-access endpoint. The approved finance scope excludes payouts, bank accounts and money movement, and TicketBox charges no fees.

## Decision

- **Identity owns the organization profile:** contacts, statement details (legal name, tax code, billing address), the logo and the reporting timezone.
  - The display name stays `organizations.name` under platform control.
  - Logos are stored through an Identity-owned image adapter, in a separate folder of the existing Cloudinary account.
- **Other services read the profile only through contracts:**
  - `identity.organization-profile.v1`, an internal read with the service token.
  - An additive, optional `reportingTimezone` in `identity.organization-access.v1`.
  - No service copies Identity tables or keeps a live projection of the profile.
- **Ticketing owns settlement statements.** A statement is an immutable, numbered read model for a final performance or event.
  - It is built from `sales_ledger` and `payment_reconciliation` in one query snapshot, with a fingerprint of the rows used to detect later changes.
  - It stores a snapshot of the organization's statement details and the rendered PDF.
  - Later changes produce a superseding revision. Earlier revisions are never altered.
- **A statement is not an invoice, payable or transfer.** It records sales and refunds processed by TicketBox, a platform fee of 0 VND, and provider-verified amounts. A payout ledger, bank accounts and transfer batches remain out of scope and need their own ADR.

## Consequences

- Organizers manage their profile in one place. Changes reach sales reports on the next request and statements at the next issue.
- Issuing a statement depends on Identity being available. Reading and downloading issued statements do not.
- Ticketing stores a copy of the statement details inside each statement as a historical record, not as a synchronised projection.
- Statements and sales reports share the ADR 0005 definitions. A statement equals the all-time Sales report for its scope when it was issued.
- Identity gains a Cloudinary dependency for logos, using the same configuration variables as Catalog.

[OpenSpec change](../../openspec/changes/organizer-settings-and-statements/design.md) · [ADR 0002](0002-organization-ownership.md) · [ADR 0005](0005-sales-ledger.md)
