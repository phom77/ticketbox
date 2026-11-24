# Proposal

## Why

Buyers meet two unrelated ticket pickers: `SeatSelectionPage` (legacy zone-only concerts) and `PerformanceSelectionPage` (Event + Performance model with maps and seats). The performance page has a mouse-only, `aria-hidden` map, raw server error text, no filters, a static "Held until" time and no way to release a hold on leave. The waiting room shows little more than a number.

This change is U4 of the buyer UI/UX redesign plan.

## What Changes

- One "Choose tickets" page for both models at `/events/:eventId/performances/:id/tickets` (Event + Performance) and `/events/:eventId/tickets` (legacy concert; the concert id is its event id, ADR 0003). `/…/seats` and `/concerts/:id/seats` redirect. The waiting room navigates to the new route.
- Map and list split on desktop, Map/List tabs on mobile. Filter bar: quantity (from `?qty=`), price range, ticket type, accessible only; list sort Lowest price / Best seats.
- Keyboard-focusable section buttons with accessible names, tooltips, a legend, zoom/pan (buttons, wheel, pinch), drill-down into seats; the list is an equivalent route. Legacy concerts render through the same page via an adapter and keep per-click reserve/release semantics.
- Quantity stepper with "Max N per account" and a disabled reason.
- Summary and docked action bar: held items, all-in total, hold timer with warning and expiry back to the waiting room, Continue to checkout. Leave releases the performance hold (`DELETE /api/v2/performances/{id}/hold`).
- Server 4xx (quota, sold out, version conflict, rate limit) are mapped to translated messages.
- Waiting room: event art and title, progress card, ETA range, last updated, one-tab guidance, pre-sale checklist, room and queue counts, optional sound and browser notification on admission, duplicate-tab warning.

## Impact

- Frontend only. No contract, backend or storage change. Idempotency keys, hold version, order creation per model and queue admission storage are unchanged.
- Deferred: a best-available server endpoint and seat-view photos.
