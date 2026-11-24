# Design

## Context

The buyer redesign plan (U1) asks for shared foundations before page redesigns. The constraints are: keep the tokens in `src/app/app.css`, keep all text in the en and vi catalogs, keep current HTTP contracts, and preserve the purchase and recovery behaviour already accepted in `buyer-purchase-flow`.

## Decisions

### Theme preference shared by both layouts

`hooks/useThemePreference.ts` holds the theme in a small external store read with `useSyncExternalStore`. It keeps the existing `ticketbox.workspace.theme` storage key, so a choice made in a workspace carries over to the buyer site and back. The first visit follows `prefers-color-scheme`. Storage failures keep the choice for the session. `OperationsLayout` keeps setting `data-theme` on its shell. `PublicLayout` sets `data-theme` on `<html>` while it is mounted, so portals (ticket dialog, toasts) get the same palette, and removes it on unmount so workspace pages keep their scoped palette. Buyer dark tokens override the existing token names under `:root[data-theme='dark']`; component styles that hard-code light colours get scoped overrides.

Alternative considered: separate buyer and workspace preferences. Rejected because the product feedback asks for one persistent, user-selectable theme.

### 3-part search on existing parameters

- **What** is the existing `Find events` search box. It keeps its accessible name, so search remains discoverable and fixtures keep working.
- **Where** (city or venue) is joined to What in `q`. Catalog already matches every word in `q` against the event title, translated titles and venue name, accent-insensitively, so a city in the venue name narrows the results without a new parameter. The split is remembered in session storage and restored only while `q` still equals the remembered combination; otherwise What shows the whole `q`.
- **When** writes `date` (today, weekend, next-30) or `custom` with `from`/`to` from native calendar inputs, using the same validation as the catalogue filter panel.
- Submitting keeps the other catalogue parameters (`status`, `sort`) when the buyer is already on `/events`, as today.
- **Suggestions.** After two characters and a 250 ms pause, the header calls the existing discovery endpoint with `q` and shows up to five events and five matching venues. Choosing an event opens it; choosing a venue fills Where. Artists are omitted until Catalog has artist data (U2/U7). With an empty field, the last five searches stored on the device are offered with a Clear action. The field follows the ARIA combobox pattern with a grouped listbox, arrow keys, Enter and Escape. Escape closes the list before it closes the mobile search panel.

### Browse row

The row links to `/events` views that Catalog supports now: all events, on sale, today, this weekend, next 30 days and coming soon. The current view is marked with `aria-current`. City and category entries will be added by U2 with the API filters; showing them now would offer filters that do nothing.

### Purchase progress and hold timer

`PurchaseProgress` is an ordered list of four steps with a visible "Step n of 4" label in `.purchase-step` and `aria-current="step"` on the current item. Pages pass their step: waiting room and ticket selection → Tickets, checkout and payment result → Checkout, confirmation → Done.

`useCountdown` gains `hours` and formats `h:mm:ss` once the remaining time reaches one hour. `HoldTimer` renders `.purchase-deadline` with a silent `role="timer"` and a separate polite live region. The live region speaks once when the warning threshold (2 minutes by default) is crossed and once on expiry, never on each tick. On expiry it shows the same "Time is up" label everywhere and leaves the existing page action (rejoin, view order history) in place.

### All-in price

`features/price/allInPrice.ts` exposes `formatPrice` (the existing VND formatter), `lowestPrice` and `PriceFrom`/`AllInPriceNote` components. Totals on ticket selection, checkout and confirmation show "Price includes all fees". The legacy event detail sale panel shows "from ₫X". Cards get prices in U2 when Catalog returns them.

### EventView adapter and purchase paths

`features/event/eventView.ts` defines `EventView` (purchase id, optional event id, title and translations, venue, start, optional timezone, image) with constructors from a concert, an event performance, an order and a ticket. `purchasePaths(view)` returns the detail, waiting-room and selection paths for either model. `loadConcertView(id, signal)` caches Catalog concert lookups per page load and is the only enrichment path for legacy orders and tickets. Performance orders and tickets use their own fields and make no Catalog call. `CheckoutEvent` becomes an alias of `EventView`.

### Order outcome and polling

`features/ticket/orderOutcome.ts` defines:

| Outcome | Rule (in order) |
|---|---|
| `paid` | order is PAID |
| `expiredPending` / `unavailable` | payment status unreadable; expired window or not |
| `expiredPending` / `expired` | window expired; payment still verifying or not |
| `review` | payment needs reconciliation or review, or order closed while verifying |
| `closed` | order no longer awaiting payment |
| `verifying` | provider has not returned a final result |
| `failed` | latest attempt failed |
| `payable` | awaiting payment with no attempt or a created/ready session |

`settled` tells callers to clear the remembered pending payment (paid, expired, closed). Each page maps outcomes to its existing screens, so behaviour is unchanged: checkout shows review and verifying as "pending", the payment result page keeps polling on `verifying` and `payable`, and the confirmation page treats both expired outcomes as expired.

`pollOrderOutcome` reads the order (and, when asked, the payment status) up to N times with a fixed interval until the caller's `isFinal` returns true, stopping early on abort. Checkout's MOCK confirmation keeps 12 × 750 ms; the payment result page keeps 15 × 2 s.

Copy for these outcomes moves into `customer:orderOutcome_*` keys with the same en/vi text, so translations and fixtures stay stable.

### Not found page

A `*` route inside `PublicLayout` renders `NotFoundPage` with the buyer header, a heading that receives focus, and actions to the role home and the catalogue (for roles that can browse it). Existing redirects (`/admin/batch-logs`) stay.

## Risks / Trade-offs

- **Dark theme coverage.** `app.css` has many hard-coded light colours. The token override covers most buyer surfaces; this change fixes the shell and the pages it touches and checks the others visually. Remaining hard-coded areas are listed as follow-ups for U2–U6, which restyle those pages.
- **Where joined to q.** A city absent from venue names will not match. U2 replaces this with a city filter.
- **Suggestion requests.** Each pause sends one discovery request (24 results). Requests are debounced and aborted when superseded.

## Migration

None. The theme key is unchanged; old language and pending-payment storage keys are untouched.
