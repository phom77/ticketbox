# Tasks

## 1. Ticketing

- [x] 1.1 Next free Ticketing migration (V23 unless another change took it): `performance_offers.description TEXT` (1–500 when set) and `min_per_order INTEGER NOT NULL DEFAULT 1 CHECK (min_per_order BETWEEN 1 AND 100)`. Never edit a merged migration.
- [x] 1.2 `PerformanceSale.Offer` and `JdbcPerformanceCatalog.apply` accept optional `description` and `minPerOrder` (absent = null / 1), stored only for newer snapshot versions. `PerformanceAvailability.OfferView` returns both. Integration tests: snapshot with and without the fields, replayed older version ignored.
- [x] 1.3 `PerformanceHolds`: refuse a positive quantity (GA quantity or seat count per offer) below `minPerOrder` before `pricedLines` and any stock change (`400 error.performance.offer-min-quantity` with ticket type name and minimum). Postgres integration tests: refusal leaves hold and stock unchanged, quantity 0 allowed, existing hold kept after the minimum is raised, replayed request key refused the same way, GA and seated lines.
- [x] 1.4 Error key in Ticketing messages (en/vi), `docs/api.md` availability and hold sections, Ticketing `GLOSSARY.md` (minimum per order).
- [x] 1.5 Checks: `scripts/mvnw-docker.sh -B -ntp -f services/ticketing/pom.xml verify` and `python3 scripts/ci/verify-service-boundaries.py --service ticketing`.

## 2. Contract

- [x] 2.1 `contracts/catalog.performance-sale-snapshot.v2.json`: optional `offer.description` (string, 1–500) and `offer.minPerOrder` (integer, 1–100). No version bump. Contract tests in Catalog (emitted payload validates and always has `minPerOrder`) and Ticketing (payload without the fields is accepted).

## 3. Catalog

- [x] 3.1 Next free Catalog migration (V22 if merged before event-classification, otherwise the next number): `performance_sale_offers.description` and `min_per_order` as in design.
- [x] 3.2 `PerformanceSale.Offer`, `JdbcPerformanceStore` reads/writes, sale API DTOs and `SaleSnapshot` builder carry both fields. `PerformanceRules.validateSale`: description trimmed (blank = null, ≤ 500), `minPerOrder` ≤ `maxPerAccount` and ≤ GA pool capacity. Unit tests for validation, integration test that a released-performance sale revision publishes the new values with `sale_version + 1` and refuses a stale version and another organization.
- [x] 3.3 Catalog messages (en/vi), `docs/api.md` sale section, Catalog `GLOSSARY.md`: UI aliases (offer = Ticket type, group = Stock pool / Seat pool), description, minimum per order.
- [x] 3.4 Checks: `scripts/mvnw-docker.sh -B -ntp -f services/catalog/pom.xml verify` and `python3 scripts/ci/verify-service-boundaries.py --service catalog`.

## 4. Web: ticket authoring

- [x] 4.1 Terminology: rename user-facing strings to Ticket type / Stock pool / Seat pool (en) and Loại vé / Nhóm chỗ / Nhóm ghế (vi). Inline help and "How stock pools work" disclosure. Restructure the advanced panel into pools with their ticket types; "Sell from an existing pool" option; read-only pool with reason after release.
- [x] 4.2 Money input: `MoneyInput` in `PerformanceSeatAssignments` and `AdminTicketTypesPage`; VND formatting in review issues, summaries and the coverage legend. Test that no `type="number"` price input remains under `pages/organizer` and `pages/admin`.
- [x] 4.3 `features/performance/saleWindowPresets.ts` with unit tests (venue timezone, clamping, empty-window refusal, matching on reload, DST-free zones and `Asia/Ho_Chi_Minh`). Preset control and window summary on each ticket type; Add an early bird helper.
- [x] 4.4 Description (textarea, 500 characters with counter) and minimum per order fields; API client types for `description` and `minPerOrder`.
- [x] 4.5 Component tests for the sale editor: first ticket type creates a pool, early bird shares the pool, frozen pool after release, minimum above limit shows the field error.

## 5. Web: layouts and large maps

- [x] 5.1 `features/performance/layoutSamples.ts` (CSV and SVG sample builders, Blob download) and "File format" disclosures. CSV errors name line and column. Unit tests: both samples import unchanged through `readSeatCsv` and `layoutSvgImport`.
- [x] 5.2 `features/performance/starterLayouts.ts` (Standing floor + seated stands, Numbered theatre, Arena) on `generateSeatGrid`, with size limits and totals. First-run picker in `PerformanceTicketSetup`/`PerformanceLayoutEditor`: saved templates, starters with previews, General admission without a map, Blank canvas. Unit tests for each generator (seat counts, row labels, aisle split, 100,000-seat refusal) and a component test that a starter fills the unsaved draft.
- [x] 5.3 Organizer Zones list in `PerformanceMapCanvas`/`PerformanceLayoutEditor` and `PerformanceSeatAssignments` (kind, seats or capacity, seats without a pool; select to zoom) and the hidden-seats hint.
- [x] 5.4 Buyer: map-unavailable fallback to the list with retry; abort and ignore stale zone responses after switching zone or performance. Vitest tests for both.
- [x] 5.5 Buyer ticket selection: description, "Minimum M per order", stepper 0 ↔ M, unavailable when fewer than M places remain, seated minimum hint, server refusal handling. Component tests.
- [x] 5.6 en/vi catalogs, `DESIGN_SYSTEM.md` (ticket terminology, money input for every price, sale-window presets). Checks: `npm --prefix frontend run lint`, `test` and `build`.

## 6. Verification

- [ ] 6.1 Large-map measurement on the 50,400-seat fixture (`scripts/e2e/performance-arena.py`, `performance-arena-browser.mjs`) in Chromium: buyer overview first render, zone open p95, seat-layer render p95, organizer draft load to first render and pan frame time. Record dataset, hardware and results here and in redesign-concert-and-seating; mark its task 5.2 done and note the map part of 6.3 as covered (concurrency and staging stay open there).
- [ ] 6.2 Keyboard pass and a manual screen-reader check (NVDA or VoiceOver) of the overview, zone list and seat list for buyer and organizer; record the result.
- [ ] 6.3 Browser fixtures: rerun `performance-layout-tools.mjs`, `performance-layout-svg.mjs`, `performance-seat-assignment.mjs`, `performance-buyer.mjs` and `purchase-seat-selection.mjs`; update selectors for the renamed labels.
- [ ] 6.4 Isolated Compose walk-through: start a map from Numbered theatre, import the sample CSV, create a ticket type with an early bird in the same pool and a pair ticket (minimum 2, description), release, buy as a buyer (1 pair ticket refused, 2 accepted), raise the minimum after release and check the buyer page. Screenshots at 1440, 834 and 390 px.
- [x] 6.5 `openspec validate seating-and-ticket-authoring-polish --type change --strict`.
