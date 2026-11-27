# ADR 0006: Event classification (segment and genre)

- **Status:** Proposed (event-classification, roadmap change B)
- **Date:** 2026-11-27
- **Replaces:** the fixed-category decision in `openspec/changes/event-categories/design.md` (six ids in `events.category`, checked by the `EventCategory` enum)

## Context

Events carry one of six flat categories. Buyers cannot narrow a category by genre, organizers cannot tag an event with more than one style, and the category is not in the Catalog → Ticketing snapshot. The approved organizer audit benchmarks Ticketmaster's Segment → Genre → SubGenre taxonomy and sizes it for the Vietnamese market.

## Decision

- **Two levels: Segment → Genre.** Segments are `concerts`, `festivals`, `sports`, `arts-theater-comedy`, `family` and `other`. Each genre belongs to one segment. Sub-genres and an artist (attraction) entity are deferred.
- **Catalog owns the reference data** in `classification_segments` and `classification_genres`, seeded and changed only by Catalog migrations. Ids are stable slugs unique across genres. Genres are retired by deactivation, never deleted.
- **Labels stay in the web i18n catalogs** (`shared:segment_*`, `shared:genre_*`), as for the earlier categories, so a new language needs no backend change.
- **Per event:** one segment, one primary genre in that segment (enforced by a composite foreign key) and up to 3 secondary genres from any segment, stored in `event_genres`. Segment and primary genre are needed before release.
- **Migration:** old categories map to segments (`arts-theater` and `comedy` merge into `arts-theater-comedy`; `comedy` gets the Stand-up genre). `events.category` is kept unwritten for one release and then dropped.
- **Contracts:** `catalog.performance-sale-snapshot.v2` gains optional `segment`, `primaryGenre` and `city`. The change is additive and consumers must tolerate absence. Classification stays owned by Catalog; Ticketing only keeps a copy for future reporting.

## Consequences

- Discovery can filter and count by segment and genre; the header browses by segment.
- Adding a genre needs a migration and two catalog keys; tests in Catalog and web pin the id list.
- Arts and theater events migrated from categories have no genre until an organizer or admin sets one.
- Ticketing can report by category later without calling Catalog. Changing a released event's segment or primary genre re-issues its sale snapshot through the existing outbox.
- A future sub-genre level can be added as a child table without changing event rows that use genres.
