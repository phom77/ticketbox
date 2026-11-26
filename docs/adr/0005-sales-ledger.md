# ADR 0005: Sales ledger and reporting dates

- **Status:** Proposed (organizer-sales-reporting)
- **Date:** 2026-11-27

## Context

Organizer revenue reports are computed on demand from `orders` and `order_items`, per concert, for COMPLETED concerts only. A refunded order changes status and disappears from totals, so past figures change and refunds are invisible. Organizers need live figures per organization, event and performance, with refunds shown.

## Decision

- Ticketing keeps an append-only `sales_ledger` read model with one `SALE` row per paid order item and one `REFUND` row per refunded order item. Rows are written in the same transaction as the order's PAID or REFUNDED transition, idempotently per order item and kind.
- Sales are dated by the payment time and refunds by the refund confirmation time (cash basis). A period's net sales are its sales minus its refunds. Earlier periods never change when a later refund happens.
- Compensation refunds for orders that were never paid create no rows.
- Historical rows are backfilled. Historical refunds are dated by the `OrderRefunded` event time, because no confirmation time was stored before this change.
- The ledger is a reporting projection. Payment reconciliation remains the source of truth for money collected and returned.

## Consequences

- Live sales, refunds and net figures are available before an event ends, aggregated through indexed queries.
- A ledger write failure fails the payment or refund transition, which is retried by the existing workflows.
- Reports and statements (change F) share one definition of sales and refunds.
- If refunds become partial in the future, `REFUND` rows carry the refunded quantity and amount without changing this model.
