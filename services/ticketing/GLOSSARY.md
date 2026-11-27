# Ticketing

## Language

**Order**

A customer's priced ticket purchase, with line items and a payment deadline. The organization recorded at creation determines attribution for reconciliation.

**Order item**

A quantity of one ticket type with its price fixed at purchase time.

**Hold**

Ticket stock temporarily reserved for a specific customer shopping session.

**Shopping session**

An admitted customer's time-limited access to a concert sale.

**Issued ticket**

A ticket created for a settled order and eligible for admission.

**Stock**

The available, held and allocated quantities of a ticket type.

**Verified collection**

Money confirmed by Payment. It can include a late payment for an order that Ticketing could no longer settle.

**Sales ledger**

An append-only record of each order item sold (SALE) and refunded (REFUND), written in the transaction of the order's PAID or REFUNDED transition. Sales are dated by payment time and refunds by refund confirmation time, so earlier periods never change. A reporting projection: Payment reconciliation remains the source for money movement.

**Provisional**

A sales figure that includes a performance that has not ended yet.

**Performance**

The scheduled occurrence a shopping session, allocation, order and issued ticket are for.

**General-admission inventory**

Places available in a group where attendees choose a location on arrival.

**Assigned-seat inventory**

The availability of individual seats for a performance. Each allocated seat belongs to one order at a time.

**Quoted hold**

A selection of general-admission places or assigned seats temporarily reserved for one customer, with its confirmed price and deadline.

**Settlement statement**

An issued, numbered and immutable record of the sales, refunds and provider-verified amounts of one final performance or event as of one query snapshot. It is not an invoice or a payout.

**Statement revision**

A later statement for the same scope that supersedes the previous one. Earlier revisions stay available.

**Cutoff**

The moment a statement was computed, kept for display. It does not filter data: the statement's figures are one snapshot, and its fingerprint (ledger row count plus verified reconciliation count and sums) detects later changes.

**Out of date**

A current statement whose scope's fingerprint now differs from the one stored at issue, because sales, refunds or verified provider records committed after it. It is computed when read. A statement can also be marked "details changed" when the organization's statement details differ from its snapshot; both allow a re-issue.
