# Proposal

## Why

The Seating & tickets step has a strong map editor and seat-to-price assignment, but organizers still meet internal concepts and rough edges ([audit](../../../docs/product/organizer-workflow-audit.md), roadmap change D; [UX feedback](../../../docs/product/organizer-concert-ux-feedback.md)):

- The workspace shows the internal "inventory group" and "sale offer" model with no explanation of why a ticket type needs a group.
- The seated ticket form still takes a raw number for the price, and each ticket type's sale window is two raw date-time fields.
- CSV and SVG import describe their formats in one line of help text and offer no sample file to start from.
- A new map starts from a blank canvas or from templates the organization saved earlier. There is no guided start for common venue shapes.
- Large maps are partly done: buyers already load a zone overview and open zones on demand, but task 5.2 of [redesign-concert-and-seating](../redesign-concert-and-seating/tasks.md) (render decision, keyboard and screen-reader checks, stale responses) and the map half of task 6.3 are open, and the organizer editor has no zone overview for maps above the 2,000-seat render cap.
- Ticket types have no buyer-facing description (what is included, perks) and no minimum quantity, so "pair" or "group" tickets cannot be expressed.

## What Changes

- **Plain concepts with inline help.** The UI calls an offer a **Ticket type** (Loại vé) and an inventory group a **Stock pool** (Nhóm chỗ), with short inline help and a "How stock pools work" explainer. Ticket types are listed under their pool. A ticket type gets its own pool by default; sharing a pool with another ticket type (early bird and standard, for example) is an explicit choice. API and storage names do not change.
- **VND money input everywhere a price is typed** in the Seating & tickets step and Admin ticket screens, using the existing `MoneyInput`. Review and summary lines format prices as VND.
- **Sale-window presets per ticket type**: Whole sale period, Early bird (until a chosen date), Final days (last N days before sales close), Starts later (from a chosen date) and Custom. Presets compute times in the venue timezone, stay inside the performance sale window and show a one-line summary.
- **Sample import files.** Download a sample seat CSV and a sample interactive SVG next to each import, with a short explanation of every column and attribute, the limits and what happens on error. CSV errors name the line and the column.
- **Guided first-run layout picker.** A performance without a map offers: the organization's saved templates for this venue space, then starter layouts (General admission without a map, Standing floor + seated stands, Numbered theatre, Arena) with a few size questions, then Blank canvas. Starter layouts are generated into the draft with the existing seat generator and stay fully editable.
- **Large maps.** Finish task 5.2: keep SVG for the zone overview and the per-zone seat layer (decided from the recorded measurement), verify keyboard, screen-reader and stale-response behaviour, and record a large-map measurement on the 50,400-seat arena fixture. The organizer editor and seat assignment get a zone overview list with seat counts and assignment coverage.
- **Ticket type details** (additive): an optional description (what is included, perks; up to 500 characters) and a minimum quantity per order (default 1). Both are authored in Catalog, published in the performance sale snapshot as optional fields, shown in ticket selection, and the minimum is enforced by Ticketing when a hold is updated.

## Capabilities

### New Capabilities

- `performance-ticket-authoring`: how organizers define ticket types, stock pools, prices, sale windows, descriptions and minimum quantities for a performance.

### Modified Capabilities

- `venue-layouts` (in flight in redesign-concert-and-seating; added requirements only): starter layout picker, sample import files and large-map behaviour for organizers and buyers.
- `performance-ticket-inventory` (in flight; added requirement only): minimum quantity per ticket type enforced on holds.
- `buyer-purchase-flow`: ticket type description and minimum quantity in ticket selection.

## Impact

- **Catalog:** one additive migration on `performance_sale_offers` (`description`, `min_per_order`), next free version at merge (V22 if this merges before event-classification, otherwise after it). Sale validation, organizer sale API and snapshot builder carry the two fields. Edits after release follow the existing sale-revision path.
- **Contract (additive, flagged):** `contracts/catalog.performance-sale-snapshot.v2.json` gains optional `offer.description` and `offer.minPerOrder`. Absent means no description and a minimum of 1. No schema version bump.
- **Ticketing:** one additive migration on `performance_offers` (next free version, V23 if nothing else lands first), projection stores the fields, availability returns them, `PerformanceHolds` rejects a hold line below the minimum. No change to stock, hold locking, quota or order transactions: the check runs before any stock change and only refuses the request.
- **Check-in, Payment, Notification, Identity:** none.
- **Web:** `PerformanceSaleEditor`, `PerformanceSeatAssignments`, `PerformanceTicketSetup`, `PerformanceLayoutEditor`, `PerformanceMapCanvas`, `features/performance/layout*.ts`, buyer `PerformanceTickets`/`PerformanceMaps`/`SelectionParts`, en/vi catalogs, `DESIGN_SYSTEM.md` (terminology and money input).
- **No new architecture decision.** Related: [ADR 0003](../../../docs/adr/0003-event-performance-and-inventory.md), [redesign-concert-and-seating design](../redesign-concert-and-seating/design.md).
