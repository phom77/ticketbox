# Tasks

Prerequisite: archive `event-categories` (all tasks done) before archiving this change, because the spec deltas rename and modify its requirements.

## 1. Catalog

- [ ] 1.1 Migration (next free version, V22 at the time of writing): `classification_segments`, `classification_genres` (seeded with the curated list in design.md), `events.segment_id`/`primary_genre_id` with the composite FK and CHECK, `event_genres` with its index, backfill from `category` with logged counts, demo seed genres. Migration test on a copy with every old category value and nulls.
- [ ] 1.2 `classification` capability: `EventClassification` domain value and `ClassificationReference`, `ClassificationStore` port with cached JDBC adapter, `GET /api/v2/classifications` (anonymous, cacheable). Remove `EventCategory`. Unit tests for every validation rule (segment, outside segment, unknown, inactive new vs unchanged, duplicate, primary as tag, 4 tags). Update ArchitectureTest.
- [ ] 1.3 Event writes: organizer create/update and content revision details carry `segment`, `primaryGenre`, `genres`; old `category` input mapped; version bumps as for other reviewed content; approval applies classification under the event lock. Integration tests for draft save, staged revision on a released event, approval, 403/404/401.
- [ ] 1.4 Readiness: `classification-missing` blocking issue in the publication review. Test that submission is refused and released events keep selling.
- [ ] 1.5 Admin `PUT /api/admin/events/{id}/classification` (native and legacy-linked, version check, audit); `/admin/concerts/{id}/category` mapped for one release. HTTP tests including a stale version.
- [ ] 1.6 Discovery and facets: `segment` and `genre` filters (primary or tag), `category` alias, 400 for unknown ids, facets with counts and the deprecated `categories`. Integration tests for each filter, the alias and counts across primary and tag use.
- [ ] 1.7 Snapshot: `segment`, `primaryGenre`, `city` in `SaleSnapshot`; re-issue on approved or Admin segment/primary-genre change of released performances (reuse title re-sync). Contract test validates snapshots with and without the fields against the schema.
- [ ] 1.8 Event and card reads return classification and the deprecated `category`. Update `docs/api.md` and the Catalog `GLOSSARY.md` (segment, genre, primary genre, tag).

## 2. Contracts

- [ ] 2.1 Add the three optional nullable properties to `contracts/catalog.performance-sale-snapshot.v2.json`. Confirm no required list or `additionalProperties` change.

## 3. Ticketing

- [ ] 3.1 Add nullable `segment`, `primaryGenre`, `city` to `PerformanceSale`; tests apply a snapshot with the fields, without them and with nulls, and prove an older version is still ignored. No migration.

## 4. Check-in

- [ ] 4.1 Test that `CheckinProjectionReceiver` applies a snapshot carrying the new fields unchanged.

## 5. Web

- [ ] 5.1 `features/discovery/classification.ts` replacing `categories.ts` (ids, label keys, fallback text, old-category alias map) and an API client for `/api/v2/classifications`. Vitest pins the ids to the Catalog seed list.
- [ ] 5.2 `ClassificationPicker`: segment radio group, searchable primary genre combobox, tag multi-select with chips and limit message; light and dark workspace themes. Component tests for keyboard selection, filtering, segment change clearing an out-of-segment primary genre, and the 3-tag limit. DESIGN_SYSTEM.md note.
- [ ] 5.3 Event details step and Admin content-change comparison use the picker; readiness link to it; *Classify this event* prompt for released unclassified events.
- [ ] 5.4 Buyer: header segment links, segment page genre chips and *More genres*, filter panel Segment and Genre, old `category` URL rewrite, facets fallback, translated genre on cards and event detail.
- [ ] 5.5 en/vi catalogs: `shared:segment_*`, `shared:genre_*`, picker and validation messages; remove unused `shared:category_*`.

## 6. Verification

- [ ] 6.1 Catalog, Ticketing and Check-in Maven verify; `verify-service-boundaries.py --service catalog`, `--service ticketing`, `--service checkin`.
- [ ] 6.2 `npm --prefix frontend run lint`, `test` and `build`.
- [ ] 6.3 Compose walkthrough on an isolated project: classify a new event, release it, change its genre and approve, browse Concerts → genre chip, open an old `?category=` link, confirm the Ticketing projection has the fields. Screenshots of the picker and a segment page at 1440, 834 and 390 px, keyboard path through the picker.
- [ ] 6.4 `openspec validate event-classification --type change --strict`.
