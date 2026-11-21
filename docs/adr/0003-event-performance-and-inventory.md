# ADR 0003. Event performances and seat inventory

**Status** Accepted for implementation on 2026-11-20.

## Decision

Catalog owns events, performances, venue spaces, layout revisions, sale offers and configured capacities. An event describes the production. Each performance has its own schedule, purchase window and venue. Its published layout is an immutable copy of the performance draft. The same venue template can produce layouts with different stage positions and sellable areas.

Ticketing owns admission to the sale, holds, allocations, orders and issued tickets. A general-admission group shares one stock count across its offers. An assigned seat has one inventory record per performance. Ticketing confirms a selection as a unit in a PostgreSQL transaction. Quotas count the account's live holds, awaiting-payment orders and paid orders across all offers of the performance.

A confirmed hold retains its quoted price until the earlier of hold expiry or sale close. Closing an offer or revising prices affects additional items. Suspending or cancelling a performance prevents new orders. Existing orders and settlements follow the current cancellation, expiry, payment and reconciliation decisions. Concurrent handling and callback replays continue to depend on the owning services' transaction guarantees.

Check-in owns admission for a ticket and performance. Staff access requires authorization scoped to that performance. A pending offline scan receives authoritative confirmation after sync. Hoãn/hủy and operations reporting are scoped to the performance.

## Compatibility

Legacy Concerts retain their public IDs, purchase flow, QR and history. Catalog maps a legacy UUID to a single Event and Performance using that ID in their separate tables. Ticketing persists the permitted write mode under the performance guard. The V2 writer is enabled before a new sale opens, with one write mode for the life of that sale. An activated V2 sale is recovered with V2-capable processes when buyer entry is paused. Payment order and callback contracts retain their existing identities.

The phased rollout starts with GA, then assigned seats and mixed layouts. Ticketing acknowledges a complete sale configuration before Catalog offers purchase for that version. Check-in sync state is visible separately. Real pilot depends on scoped staff, physical-device rehearsal and merchant acceptance.

[Design](../../openspec/changes/redesign-concert-and-seating/design.md) · [Organization ownership](0002-organization-ownership.md) · [Purchase consistency](../architecture.md#purchase-consistency)
