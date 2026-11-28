# Proposal

## Why

Events have one flat category out of six (`events.category`, checked by the `EventCategory` enum since the event-categories change). Buyers cannot narrow Concerts to V-Pop or Sports to Football, organizers cannot say that a festival is mostly EDM, and the category is not in the Catalog → Ticketing snapshot, so sales cannot be reported by category. The product owner approved a Ticketmaster-style Segment → Genre taxonomy sized for Vietnam ([audit](../../../docs/product/organizer-workflow-audit.md), section 3 and roadmap change B).

## What Changes

- **Two-level taxonomy.** Six segments (`concerts`, `sports`, `arts-theater-comedy`, `family`, `festivals`, `other`) and a curated list of genres per segment, stored in Catalog reference tables seeded by migration. Labels live in the web i18n catalogs (`shared:segment_*`, `shared:genre_*`). A public read endpoint returns the active list.
- **Classification per event.** Each event has one segment, one primary genre in that segment and up to 3 secondary genres used as tags. Catalog validates the combination; the `EventCategory` enum is replaced by a domain value checked against the reference data.
- **Organizer picker.** The Event details step gets a segment choice and a searchable, keyboard-accessible genre picker for the primary genre and tags. Segment and primary genre are needed before a performance is submitted for release. After release, classification changes go through the existing content revision.
- **Migration from categories.** The six category ids map to segments (`arts-theater` and `comedy` both become `arts-theater-comedy`; `comedy` also gets the Stand-up genre). The `category` column stays readable during the transition and is no longer written.
- **Buyer discovery.** `GET /api/v2/events/discovery` filters by `segment` and `genre` (primary or tag); `/facets` returns segments and genres with upcoming-event counts. The header browses by segment, a segment page shows popular genres plus a full genre list, and cards and event detail show the translated genre. Old `category` links keep working.
- **Snapshot fields.** `catalog.performance-sale-snapshot.v2` gains optional `segment`, `primaryGenre` and `city`. Ticketing stores them on its performance projection so it can report by category later; Check-in ignores them.
- **ADR 0006** replaces the fixed-category decision of event-categories.

## Capabilities

### New Capabilities

- `event-classification`: segment and genre reference data, classifying an event, review after release, migration from categories, classification in the sale snapshot.

### Modified Capabilities

- `organizer-event-publishing`: the fixed category list becomes segment, primary genre and tags.
- `buyer-discovery`: category browsing becomes segment and genre browsing with facets.

## Impact

- **Catalog:** new migration (next free version, V22 at the time of writing) with `classification_segments`, `classification_genres`, `event_genres`, `events.segment_id` and `events.primary_genre_id`, and the backfill from `category`. Classification domain value and reference-data port, `GET /api/v2/classifications`, organizer and Admin event writes, content revision details, discovery and facets, sale snapshot builder, title re-sync extended to classification. Glossary and `docs/api.md`.
- **Contracts:** `contracts/catalog.performance-sale-snapshot.v2.json`: three optional, nullable properties. Additive; no version bump.
- **Ticketing:** `PerformanceSale` keeps the three fields when present and tolerates their absence. No reporting change, no migration, no change to stock, hold, quota or order transactions.
- **Check-in, Payment, Notification, Identity:** none (Check-in tolerance pinned by a test).
- **Web:** classification module replacing `features/discovery/categories.ts`, `ClassificationPicker` in `EventDetailsStep`, Admin content-revision comparison, header segments, discovery filter panel, segment page genre chips, cards and event detail labels, en/vi catalogs.
- **Decision record:** [ADR 0006](../../../docs/adr/0006-event-classification.md) (Proposed).
