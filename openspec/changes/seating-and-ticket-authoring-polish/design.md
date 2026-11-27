# Design

## Context

- **Data model (Catalog V15).** `performance_sale_groups` (GA pool with capacity, or ASSIGNED seat group tied to a map section) and `performance_sale_offers` (name, price `NUMERIC(12,0)` VND, `sale_start_at`/`sale_end_at`, `active`, FK to one group). Several offers may share one group. Released performances accept sale revisions through `PerformanceCatalog.saveSale`: groups and each offer's group are frozen, while names, prices, windows and new offers publish a new snapshot (`sale_version + 1`).
- **Snapshot.** `contracts/catalog.performance-sale-snapshot.v2.json` has no `additionalProperties: false`; Ticketing receives it at `PUT /internal/ticketing/catalog/performances/{id}` and projects offers into `ticket_types` (name, price) and `performance_offers` (window, group). Buyers read offer name, price and active state from Ticketing `GET /api/v2/performances/{id}/availability` (`PerformanceAvailability.OfferView`).
- **Web.** `PerformanceSaleEditor` already uses `MoneyInput` (Phase 0), but labels read "Inventory group" / "Sale offer" and the advanced panel exposes groups and offers as two flat lists. `PerformanceSeatAssignments` still has `<input name="price" type="number">`. Each offer's window uses two `PerformanceDateTimeField`s plus "Use performance sale window". `AdminTicketTypesPage` (legacy, Admin only) uses raw number inputs.
- **Layout authoring.** `PerformanceLayoutEditor` supports templates per venue space (`layout_templates`, organization-owned), seat generation (`generateSeatGrid`), CSV import (`section,row,seat,x,y`, error reports only the line) and interactive SVG import (`data-code`, `data-kind`, `data-row`, `data-seat`, `data-accessible`, `data-restricted-view`, `data-blocked`; up to 20 MB). There is no static asset folder, and no sample files.
- **Large maps.** Catalog serves `GET /api/v2/performances/{id}/layout` (zone overview) and `.../layout/sections/{section}` with ETag; Ticketing serves availability for the overview and per section. `PerformanceTickets` loads a zone only when opened and drops responses whose layout version does not match. `PerformanceMapCanvas` culls seats to the viewport and caps rendering at 2,000 seats, showing zones only at overview zoom on large maps. The recorded measurement in redesign-concert-and-seating (50,400 seats, 49 zones, ~9.2 MB draft payload) gave SVG seat-layer p95 of 2.1 ms at 500 seats and 5.0 ms at 1,050 seats (Canvas 0.4 ms), zone geometry p95 48.3 ms and zone seat status p95 363.1 ms. Fixtures exist: `scripts/e2e/performance-arena.py` and `performance-arena-browser.mjs`.
- **Latest migrations.** Catalog V21 (event content). Ticketing V22 (reconciliation effective time). Event-classification (B) and organizer-settings-and-statements (F) may also add migrations in Wave 2.

## Decisions

### Terminology and structure (web only)

| Internal (API, DB, code) | English UI | Vietnamese UI |
|---|---|---|
| offer | Ticket type | Loại vé |
| group / inventory group (GA) | Stock pool | Nhóm chỗ |
| group (ASSIGNED) | Seat pool | Nhóm ghế |

- The "Tickets and stock" panel lists stock pools, each with its capacity (GA) or seat count (ASSIGNED) and the ticket types that sell from it. Inline help under the panel title: "A stock pool is the number of places you can sell. Ticket types are what buyers choose. Ticket types in the same pool share its places." A disclosure "How stock pools work" shows the early-bird + standard example.
- **Add ticket type** creates a new GA pool with a capacity field (today's add-admission form) by default. A "Sell from an existing pool" option links it to an existing pool instead. Seated ticket types keep being created from the seat assignment panel.
- After release, the pool of an existing ticket type is shown read-only with the reason ("Stock pools are fixed once sales open"), matching the existing `inventory-frozen` rule.
- Only i18n strings, grouping and help change. API, Java types, tables, contract field names and glossary terms stay `offer`/`group`; the Catalog glossary gains the UI aliases.

### Money input

- Replace the raw price inputs in `PerformanceSeatAssignments` and `AdminTicketTypesPage` with `MoneyInput` (whole VND, max 999,999,999,999, zero shown empty and rejected as "Enter a price above 0 ₫").
- Review issues, ticket summaries and the coverage legend format prices with the shared VND formatter. A test asserts no `type="number"` price field remains under `pages/organizer` and `pages/admin`.

### Sale-window presets

`features/performance/saleWindowPresets.ts` (pure functions, unit tested) computes `{saleStartAt, saleEndAt}` from the performance sale window and timezone:

| Preset | Start | End |
|---|---|---|
| Whole sale period (default) | performance sale start | performance sale end |
| Early bird | performance sale start | chosen date, 23:59 venue time |
| Final days | N days before performance sale end, 00:00 venue time (N = 1–30, default 7) | performance sale end |
| Starts later | chosen date and time | performance sale end |
| Custom | the existing date-time fields | |

- Results are clamped to the performance window. A preset that yields an empty window shows an inline error and is not applied.
- The ticket type card shows a summary such as "On sale 1 Dec, 10:00 – 15 Dec, 23:59 (Asia/Ho_Chi_Minh)". The selected preset is not stored; on reload the editor shows the preset whose rule matches the stored times, otherwise Custom.
- A helper "Add an early bird" on a ticket type creates a second ticket type in the same pool with the Early bird preset and leaves the original as the standard price. It is the main teaching moment for pools.
- Date inputs use `PerformanceDateTimeField` today. When guided-scheduling-and-multi-date (C) ships the calendar picker, presets use it with no API change.

### Sample import files

- `features/performance/layoutSamples.ts` builds the samples in the browser and downloads them as Blobs (`ticketbox-seats-sample.csv`, `ticketbox-map-sample.svg`). No static assets and no endpoint.
- The CSV sample has the header `section,row,seat,x,y`, two sections, three rows each and quoted labels with a comma, inside a 1000 × 600 coordinate space. The SVG sample has a stage shape, one GA zone (`data-kind="GA"`) and one seated zone with rows and seats, including one accessible, one restricted-view and one blocked seat.
- Each import shows a "File format" disclosure: columns or attributes, units (map coordinates from the top-left), limits (100,000 seats, 20 MB SVG) and that nothing changes in the draft until the whole file is valid.
- CSV errors become "Line 14, column x: enter a number" (column names: section, row, seat, x, y). Unit tests import both samples unchanged and expect success.

### Guided first-run layout picker

- Shown when the selling model needs a map (zones, reserved or mixed) and the performance has no saved layout. Order: saved templates for this venue space (existing `listLayoutTemplates`), starter layouts, Blank canvas. "General admission without a map" switches the selling model to admission.
- Starter layouts live in `features/performance/starterLayouts.ts` as generators, not Catalog data:

| Starter | Questions (defaults) | Result |
|---|---|---|
| Standing floor + seated stands | floor capacity (1,000), stand rows (10), seats per row (20) | stage, one GA floor zone, two ASSIGNED side stands |
| Numbered theatre | rows (15), seats per row (24), centre aisle (yes) | stage, stalls zone with lettered rows and numbered seats, split at the aisle |
| Arena | floor capacity (5,000), stands (4), rows (20), seats per row (40) | stage, GA floor, four ASSIGNED stands around it |

- Generation uses `generateSeatGrid` and `nextSectionCode`/`nextRowLabel`, respects `maximumLayoutSeats` (100,000) and shows the resulting seat and capacity totals before inserting. The result goes into the unsaved draft; nothing is stored until the organizer saves the layout under the existing optimistic version, so undo and the discard confirmation apply.
- A small static SVG preview per starter is rendered from the same generator with default sizes.

### Large maps (task 5.2 and the map part of 6.3)

- **Render approach: SVG.** The recorded measurement shows the SVG seat layer within a 16 ms frame at the sizes rendered (at most 2,000 seats in the editor, one zone for buyers). Canvas would add a second hit-testing and accessibility path with no user-visible gain. The decision is recorded in redesign-concert-and-seating design §3.4 and the task marked done when this change's checks pass.
- **Buyer.** Keep the compact zone overview and per-zone loading. Add: an explicit "Map unavailable, choose from the list" fallback when overview or zone geometry fails; abort and ignore zone responses after the buyer switches performance or zone (by request sequence and performance id, extending the existing version check); a Vitest test for each.
- **Organizer.** A "Zones" side list in the editor and seat assignment shows each zone with kind, seat count or capacity, and the number of seats without a seat pool; selecting a zone zooms the canvas to it and loads its seats into the render budget. When the cap hides seats, the canvas says how to see them ("Zoom in or choose a zone to edit seats"). The editor still loads and saves the whole draft; partial draft loading is out of scope (see Risks).
- **Measurement (local, recorded in tasks).** On the 50,400-seat arena fixture in Chromium: buyer overview first render, zone open (geometry + status) p95 and seat-layer render p95; organizer draft load to first render and pan frame time at the 2,000-seat cap. Targets: zone open p95 ≤ 500 ms, seat-layer render p95 ≤ 16 ms, editor first render ≤ 3 s. Concurrency load and staging go/no-go stay in redesign-concert-and-seating tasks 6.3 (concurrent hold/checkout part) and 6.4.
- **Accessibility.** Keyboard route through overview, zone list and seat list; a manual screen-reader check (NVDA or VoiceOver) of zone and seat labels and selected state, recorded in the tasks.

### Ticket type description and minimum quantity (additive)

- **Catalog migration** (next free version): `ALTER TABLE performance_sale_offers ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 500)`, `ADD COLUMN min_per_order INTEGER NOT NULL DEFAULT 1 CHECK (min_per_order BETWEEN 1 AND 100)`. Existing rows get no description and minimum 1.
- `PerformanceSale.Offer` gains `description` (nullable, trimmed, blank becomes null, plain text, line breaks kept) and `minPerOrder`. `PerformanceRules.validateSale` refuses `minPerOrder > maxPerAccount` (`error.performance.offer-min-above-limit`) and, for a GA pool, `minPerOrder > capacity`. Both fields are editable after release through the existing sale revision.
- **Contract (additive, flagged for review):** the snapshot `offer` gains optional `description` (string, 1–500) and `minPerOrder` (integer, 1–100). Catalog always sends `minPerOrder`; receivers treat absence as 1. Contract tests cover a payload with and without the fields.
- **Ticketing migration** (next free version): `performance_offers` gains `description TEXT` and `min_per_order INTEGER NOT NULL DEFAULT 1`. `JdbcPerformanceCatalog.apply` stores them for newer snapshot versions. `OfferView` returns them.
- **Enforcement:** in `PerformanceHolds`, before `pricedLines` and any stock change, every offer with a positive quantity in the requested hold (GA quantity, or number of seats for that offer) must be at least its `minPerOrder`; otherwise `400 error.performance.offer-min-quantity` with the offer id and minimum. Removing an offer entirely (quantity 0) is always allowed. Holds created before a minimum was raised keep their lines until they are changed or expire, like captured prices. Order creation from a valid hold is unchanged. No change to stock, locking, quota or order transactions.
- **Buyer:** ticket selection shows the description under the ticket type name and "Minimum M per order"; the quantity stepper jumps from 0 to M and back; when fewer than M places remain the ticket type shows as unavailable with the reason. Seated selection shows "Choose at least M seats for this ticket type" until met.

## Defaults to confirm in review

- Vietnamese labels "Loại vé", "Nhóm chỗ" and "Nhóm ghế" (see Open questions for the English terms).
- The preset list and defaults (Final days N = 7; Early bird ends 23:59 venue time).
- Starter layouts are frontend generators, not Catalog reference data; the three starters and their default sizes above.
- Samples are generated in the browser, not served as files.
- The description is one plain-text field in the event's original language, not translated per locale; translations can follow event content later.
- The minimum quantity is per order (per hold), not per account; the existing `maxPerAccount` stays per account and performance.
- The organizer editor keeps whole-draft loading; partial draft loading is not part of this change.

## Risks / Trade-offs

- **Contract drift.** If Catalog sends `minPerOrder` before Ticketing enforces it, buyers could hold fewer than the minimum. Rollout deploys Ticketing first; Catalog tests pin that `minPerOrder` is always present.
- **Minimum blocks the last places.** A pool with fewer places left than the minimum cannot sell them through that ticket type. The organizer sees "N places can't be sold at the minimum" in the sales summary; adding a ticket type with minimum 1 in the same pool resolves it.
- **Starter layouts versus real venues.** Starters are generic shapes. The picker says so and points to background images and editing tools; saved templates remain the route for exact venues.
- **Large drafts in the editor.** A 9.2 MB draft is parsed in full. The measurement records the cost; if editor first render exceeds 3 s, a follow-up change adds per-zone draft loading with partial saves.
- **Parallel Wave 2 migrations.** B and F may take the next Catalog or Ticketing versions. The builder takes the next free number at merge and never renumbers a merged migration.

## Rollout

1. Ticketing migration, projection and hold check (tolerant of missing fields). Deploy.
2. Catalog migration, validation, sale API and snapshot fields. Deploy. Released performances keep minimum 1 until an organizer edits them.
3. Web: terminology, money input, presets, samples, starter picker, zone list, buyer details and fallbacks. No feature flag: every part is additive and works with existing data.
4. Rollback: web changes revert independently. Columns stay; a reverted Catalog stops sending the fields and Ticketing defaults to minimum 1.

## Open questions

1. **Use "Ticket type" and "Stock pool" as the organizer-facing names?** Recommended: yes, with "Seat pool" for seated groups. *Reason: "ticket type" is what organizers and buyers already say; "pool" explains shared capacity without the word "inventory".*
2. **Add ticket type descriptions now, through the snapshot to Ticketing?** Recommended: yes. *Reason: additive optional field, buyers read ticket details from the same availability response, and perks are a common request.*
3. **Add a minimum quantity per order, enforced by Ticketing on holds?** Recommended: yes, as a validation-only check before any stock change. *Reason: enables pair and group tickets cheaply without touching stock, locking, quota or order transactions.*
4. **Scope of the large-map work: finish task 5.2 and only the map-rendering part of task 6.3 here, leaving concurrent hold/checkout load and staging (6.3 remainder, 6.4) in redesign-concert-and-seating?** Recommended: yes. *Reason: concurrency and staging acceptance need a staging environment and merchant setup that this change cannot provide.*

## Decisions confirmed by the product owner (2026-11-27)

The product owner accepted the recommended answer to every open question:

- Organizer-facing names are "Ticket type" and "Stock pool"/"Seat pool". API and database names are unchanged.
- Optional ticket-type descriptions (up to 500 characters) are added to the snapshot additively.
- `minPerOrder` is approved: Ticketing refuses holds below the minimum before any stock change. This is explicitly approved by the product owner as a hold-path validation.
- Scope: finish task 5.2 and the map-rendering half of 6.3, keeping SVG. Concurrency and staging acceptance (6.3 remainder, 6.4) stay in redesign-concert-and-seating.
- Migration numbers: Catalog `V23`, Ticketing `V23`.
