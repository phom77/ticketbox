# Tasks

## 1. Shared foundations

- [ ] 1.1 Extract `useThemePreference` from `OperationsLayout` and use it in both layouts. Add buyer dark tokens and scoped fixes in `app.css`. Add Vitest coverage for storage, system preference and blocked storage.
- [ ] 1.2 Add an hours format to `useCountdown` and a `HoldTimer` that announces the warning and expiry once. Add Vitest coverage.
- [ ] 1.3 Add `PurchaseProgress` and wire it with `HoldTimer` into the waiting room, ticket selection (legacy and performance), checkout, payment result and confirmation headers.
- [ ] 1.4 Add the all-in price helpers and show "Price includes all fees" with totals and "from ₫X" in the legacy sale panel.
- [ ] 1.5 Add skeleton and `BuyerState` components. Use them for the home and catalogue initial load and the event page loading, unavailable and retry states.

## 2. Data adapters

- [ ] 2.1 Add `EventView`, `purchasePaths` and the cached `loadConcertView`. Replace the duplicated waiting-room paths in `CheckoutPage`, `checkoutPresentation` enrichment, confirmation and My tickets Catalog lookups. Add Vitest coverage.
- [ ] 2.2 Add `resolveOrderOutcome` and `pollOrderOutcome`. Use them in checkout resume and MOCK confirmation, the payment result page and the confirmation page. Move their copy into `customer:orderOutcome_*`. Add Vitest coverage for every outcome.

## 3. Shell

- [ ] 3.1 Rebuild the `PublicLayout` header: 3-part search, suggestions and recent searches, browse row, header language select, theme toggle. Keep the compact booking chrome with language and theme.
- [ ] 3.2 Add `NotFoundPage` and replace the `*` redirect. Guard `/concerts/:id` with `CatalogueRoute`.
- [ ] 3.3 Document the patterns in `frontend/DESIGN_SYSTEM.md`.

## 4. Verification

- [ ] 4.1 `npm --prefix frontend run lint`, `npm --prefix frontend test`, `npm --prefix frontend run build` and `openspec validate buyer-shell-and-foundations --type change --strict`.
- [ ] 4.2 Update the buyer browser fixtures broken by the header and progress changes and extend them for the 3-part search, theme and 404. Run them against Vite on port 5185 (`buyer-navigation-auth`, `buyer-discovery`, `buyer-event-and-queue`, `purchase-seat-selection`, `buyer-ticket-wallet`, `buyer-account-orders`, `checkout-recovery`).
- [ ] 4.3 Check the shell, 404 and purchase headers at 1440, 834 and 390 px, light and dark, en and vi. Save screenshots under `.artifacts/u1/`.
