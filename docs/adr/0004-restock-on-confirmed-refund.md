# ADR 0004: Return refunded seats to sale

- **Status:** Accepted (buyer-refund-requests, approved by the product owner on 2026-11-25)
- **Date:** 2026-11-25

## Context

`order-support-and-event-refunds` decided that applying a confirmed refund does not restock the sale, because refunds were rare operator actions, mostly for cancelled events where no sale continues. Buyer refund requests (U7) make refunds routine for events still on sale. Keeping refunded seats out of stock leaves sellable inventory unused.

## Decision

When Ticketing applies a confirmed refund result for a performance that is on sale, not disrupted and before its sale end, it returns the order's reserved seats or general-admission quantity to stock and reduces the buyer's per-account quota usage, in the same transaction that cancels the tickets, under the existing inventory locks and event ordering. In every other case stock is unchanged.

## Consequences

- Restock happens only after Payment's verified refund and Check-in's admission hold, so a refunded ticket cannot be admitted when its seat is sold again (online admission).
- Idempotent replay of the refund result must not restock twice; the refund transition records that stock was released.
- Reports (A3) show the refund and the later resale as separate collections.
