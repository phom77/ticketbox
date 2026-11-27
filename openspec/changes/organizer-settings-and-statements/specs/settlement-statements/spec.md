# Settlement statements

## ADDED Requirements

### Requirement: Statements for final performances and events

Ticketing SHALL let a member with `FINANCE` issue a settlement statement for a performance or an event of the selected organization once it is final. A performance is final when it is completed, cancelled with no paid order left, or past its end. An event is final when all its non-draft performances are final.

#### Scenario: Performance has ended

- **WHEN** a `FINANCE` member opens Reports › Statements after a performance has ended
- **THEN** the performance is listed as ready for a statement with its net sales to date, and the member can issue a statement.

#### Scenario: Scope is not final

- **WHEN** a statement is requested for a performance that has not ended, a cancelled performance with refunds pending, or an event with any performance that is not final
- **THEN** no statement is issued and the response states why the scope is not ready.

#### Scenario: Member without the finance grant

- **WHEN** a member without `FINANCE` opens Reports › Statements or calls a statement endpoint
- **THEN** the request is refused, no statement data is returned, and the workspace shows the required grant and a route back to an allowed area.

#### Scenario: Another organization's scope or statement

- **WHEN** a member requests a statement, or issues one, for a performance, event or statement id that belongs to another organization
- **THEN** the id is treated as not found and nothing is written.

### Requirement: Statement contents

A statement SHALL show the organization's statement details, scope, timezone, cutoff, gross sales, refunds, net sales, sale and refund order counts, and tickets sold and refunded. It SHALL include breakdowns by performance (for an event), by ticket type and by payment provider. Figures SHALL match the all-time Sales report for the same scope at the cutoff.

#### Scenario: Event with a refund

- **WHEN** a statement is issued for an event with two performances where one order was refunded before the cutoff
- **THEN** gross sales include the refunded order, refunds show its amount, net sales exclude it, and the performance lines add up to the totals.

#### Scenario: Provider breakdown and reconciliation

- **WHEN** a statement covers orders paid through MoMo and VNPAY, and one paid order has no verified provider record
- **THEN** each provider line shows its ledger sales and refunds next to the amounts the provider verified
- **AND** the statement shows one unreconciled order with a link to Reconciliation for the scope.

#### Scenario: Statement details are missing

- **WHEN** a `FINANCE` member issues a statement for an organization with no legal name or tax code
- **THEN** the confirmation warns that these details are missing and links to Settings, and if the member continues, the statement prints the display name and marks the missing fields as not provided.

#### Scenario: No sales

- **WHEN** a statement is issued for a final performance with no paid orders
- **THEN** the statement shows zero figures and no provider lines.

### Requirement: Statements are not payouts

Each statement SHALL state that TicketBox charges no platform fee and that the statement records sales and refunds without moving money. It SHALL label net sales as net sales, not as an amount payable.

#### Scenario: Reading the statement header and footer

- **WHEN** a `FINANCE` member opens or downloads any statement
- **THEN** it shows "Platform fee: 0 VND" and a footer stating that it is not an invoice, payout or transfer
- **AND** no payout, balance or bank account information appears.

### Requirement: Issued statements are immutable and revisable

An issued statement SHALL have a unique number. It SHALL keep its figures, organization details and PDF unchanged. When sales, refunds or provider records for its scope change after its cutoff, the statement SHALL be marked out of date. A new revision SHALL supersede it, and earlier revisions SHALL stay available.

#### Scenario: Refund after issue

- **WHEN** an order in a statement's scope is refunded after the statement was issued
- **THEN** the statement keeps its figures and is shown as out of date with a Re-issue action
- **AND** re-issuing creates revision 2 with the refund included, and revision 1 is labelled "Superseded by" revision 2 and stays downloadable.

#### Scenario: Profile changes after issue

- **WHEN** the organization changes its legal name or logo after a statement was issued
- **THEN** the issued statement still shows the details captured at issue, and the next revision uses the new details.

#### Scenario: Concurrent or repeated issue

- **WHEN** two members issue a statement for the same scope at the same time, or a member submits the same issue twice
- **THEN** exactly one new revision is created and the other request receives a conflict with the current statement.

#### Scenario: Identity unavailable at issue time

- **WHEN** Ticketing cannot read the organization profile while issuing a statement
- **THEN** no statement is issued, the member sees a retryable error, and issued statements remain readable and downloadable.

#### Scenario: Logo cannot be fetched

- **WHEN** the organization's logo cannot be fetched within the time and size limits while issuing
- **THEN** the statement is issued without a logo and the member is told the logo was omitted.

### Requirement: Statement downloads

Members with `FINANCE` SHALL download any revision of a statement as PDF or CSV. Both formats SHALL contain the same figures, number, revision, scope, timezone and cutoff, and SHALL render Vietnamese text correctly.

#### Scenario: Download a statement

- **WHEN** a `FINANCE` member downloads a statement as PDF and as CSV
- **THEN** both files show the same totals and lines as the statement screen, and the filename names the statement number and revision.

#### Scenario: Repeated PDF download

- **WHEN** the same statement revision is downloaded as PDF at different times
- **THEN** the files are byte-identical.

#### Scenario: Unsupported format

- **WHEN** a download is requested in a format other than PDF or CSV
- **THEN** the request is refused with a translated message and no file is returned.
