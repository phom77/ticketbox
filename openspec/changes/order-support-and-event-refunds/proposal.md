# Proposal

## Why

TicketBox operators need to find a buyer's order and explain what happened across payment, ticket issuance and email. A3 verifies collections, which gives operators the evidence needed to handle late money and record externally confirmed refunds.

## What Changes

- Add paginated support search by order ID, exact buyer email or provider transaction reference. Add order detail with payment, tickets, email delivery and compensation history.
- Surface actionable exceptions in the platform workspace and reuse the existing query redrive and email retry commands.
- Support operator-managed, full-order refunds with independently approved actions, audit and verified external references. Invalidate affected tickets, notify buyers and publish the result to A3.
- Give platform operators an impact preview and resumable workflow for event postponement and cancellation. Keep mobile scanner and offline operation in the separate scanner project.

## Capabilities

### New Capabilities

- `order-support` — Scoped order lookup, exception triage and recovery.
- `event-refunds` — Operator decisions, externally confirmed refunds and event disruption handling.

### Modified Capabilities

None.

## Impact

Ticketing owns order impact and support views. Payment owns refund evidence and audit. Catalog owns the sale and event status, Check-in owns admission, and Notification owns delivery. Additive internal contracts preserve A1 organization scope and A3 settlement. See [organization ownership](../../../docs/adr/0002-organization-ownership.md), [A3](../vnpay-merchant-and-sales-reconciliation/design.md) and [roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md).
