# Proposal

## Why

The buyer screens work, but they do not yet share a production-grade shell or common building blocks. The header has a single keyword field, no browse row and no theme choice, and language is hidden in the account menu. Unknown URLs silently redirect to the homepage. Each purchase step labels its progress and deadline differently, and two timers format long waits as `125:30`. Prices carry no all-in statement. Loading states are plain text. Checkout resume, the payment result page and the confirmation page each decide an order's outcome with their own copy of the same rules, polling loops and translation keys, and four places in checkout build waiting-room paths by hand.

This change is U1 of the buyer UI/UX redesign plan. It lays the shared foundations that U2–U6 build on (discovery, unified event detail, ticket selection, checkout and wallet/account).

## What Changes

- **Buyer shell.** `PublicLayout` gains a 3-part search (Where · When · What) that reuses the existing `q`, `date`, `from` and `to` discovery parameters, with suggestions from the existing discovery search grouped into events and venues and recent searches stored on the device. A browse row links to catalogue views the Catalog API already supports (on sale, today, this weekend, next 30 days, coming soon). The language select is in the header at wider widths and stays in the account menu on narrow screens. A persistent light/dark toggle uses a theme hook extracted from `OperationsLayout`, shared by both layouts.
- **Not found page.** A real 404 page replaces the `* → /` redirect.
- **Purchase progress and hold timer.** A shared `PurchaseProgress` stepper (Choose date → Tickets → Checkout → Done) and `HoldTimer` (built on `useCountdown`, which gains an hours format) appear in the existing waiting-room, ticket selection and checkout headers. The 2-minute warning is announced once.
- **All-in price.** One price formatter shows "from ₫X" and "Price includes all fees". TicketBox charges no service fees, so there is no fee breakdown.
- **Loading and state components.** Skeleton components and a `BuyerState` component standardise loading, empty and error feedback on the pages this change touches.
- **Event data adapter.** An `EventView` normalises the legacy Concert and the Event + Performance model. One purchase path builder replaces the duplicated waiting-room paths in checkout. Confirmation, My tickets and checkout resume share one cached Catalog lookup for legacy concerts and use order or ticket performance fields directly.
- **Order outcome.** `resolveOrderOutcome` and one polling helper are shared by checkout resume, the payment result page and the confirmation page with behaviour preserved. Their copy moves to one `orderOutcome_*` namespace.
- **Route guard.** `/concerts/:id` uses the same `CatalogueRoute` guard as `/events/:eventId`.
- `frontend/DESIGN_SYSTEM.md` documents the new patterns.

## Out of scope

- City and category links and filters, price and show count on cards, and artist suggestions need new Catalog discovery fields and filters (U2). The browse row and search are built so U2 can add them.
- Redesign of the event detail, ticket selection, checkout and confirmation pages (U3–U5). This change only wires shared components into their headers and totals.
- Transfer, refund requests, wallet passes and venue/artist pages (U7).
- No backend, contract or migration change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `buyer-account-access` — header layout, language and theme in the header, compact booking chrome with progress, and a not-found page.
- `buyer-discovery` — 3-part header search with suggestions and recent searches; consistent loading, empty and error states.
- `buyer-purchase-flow` — shared progress stepper and hold timer, all-in price statement, one order-outcome decision, and the catalogue guard on the legacy concert route.

## Impact

- Frontend only: `frontend/src/components/layout/{PublicLayout,OperationsLayout}.tsx`, new shared components under `frontend/src/components/` and `frontend/src/features/{event,ticket}/`, `frontend/src/hooks/useCountdown.ts`, `frontend/src/app/App.tsx`, the purchase pages, `MyTicketsPage`, `app.css` (dark tokens), i18n catalogs and browser fixtures under `scripts/e2e/`.
- Services keep their current contracts. The order outcome logic only reads `GET /api/orders/{id}` and `GET /api/payments/{id}/status` as before.
- Builds on the accepted [buyer purchase flow](../../specs/buyer-purchase-flow/spec.md), [buyer discovery](../../specs/buyer-discovery/spec.md), [buyer account access](../../specs/buyer-account-access/spec.md) and [web language preference](../../specs/web-language-preference/spec.md) specifications, and on the theme behaviour of [operations workspaces](../../specs/operations-workspaces/spec.md).
