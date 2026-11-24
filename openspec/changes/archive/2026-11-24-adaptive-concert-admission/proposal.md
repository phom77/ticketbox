# Adaptive concert admission

## Why

Ticketing currently gives every concert the same eight shopping sessions and applies a shared cap of 32. At opening time, it also downloads the entire waiting room to draw the queue while browsers at every position refresh at the same rate.

## What Changes

- Adjust shopping-session capacity and admissions per second per concert, using actual queue demand and the health of the purchase path. Account for shared purchase and payment limits when multiple concerts are on sale.
- Assign the opening draw order before the sale. Keep arrival order for customers who join after opening and keep one waiting place per customer and concert.
- Refresh queue status based on distance from the front. Use a private real-time subscription for the first 1,000 positions and keep HTTP recovery and presence renewal.
- Give disconnected customers three minutes to resume a waiting place. An explicit leave gives up the place immediately.

## Capabilities

### New Capabilities

- `concert-admission`: Opening draw, queue continuity, adaptive shopping-session admission, and delivery of private queue status.

### Modified Capabilities

## Impact

- Ticketing owns the admission policy, Redis state, and purchase-health signals. The web waiting room owns polling cadence and connection lifecycle. The existing authenticated `join`, `status`, `leave`, and admission token interfaces are reused.
- Existing [buyer purchase requirements](../redesign-buyer-purchase-flow/specs/buyer-purchase-flow/spec.md), [purchase consistency rules](../../../docs/architecture.md#purchase-consistency), and hold and order recovery still apply.
- The agreed `75,000`-person example and request budgets are design assumptions for the enablement profile. Functional verification uses local fixtures. A notification or queue transition for inventory exhaustion is outside this change.
