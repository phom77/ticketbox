# Design

## Decisions

- **Fixed ids, translated in the web app.** The ids are stable lowercase slugs stored in `events.category`. Labels live in the web i18n catalogs (`shared:category_*`), so a new language needs no backend change. The list is defined once in Catalog (`EventCategory` value object in the performance capability's domain) and once in the web app (`features/discovery/categories.ts`); a Vitest test and a Catalog unit test pin the same six ids.
- **Validation at the use case.** `PerformanceCatalog.validateEvent` accepts null or a known id. The organizer and admin web clients send ids only.
- **Legacy concerts.** Every legacy concert already has an event row (`events.legacy_concert_id`), and `catalog_event_view` reads `e.category` for both models. The legacy editor writes the category to that row through a small Catalog command; no new column on `concerts`.
- **Backfill migration.** `V__event_categories.sql` lower-cases values, maps known synonyms to ids, sets unknown values to null, and sets categories for the demo seed event ids. Released migrations are not edited.

## Risks

- Free text an organizer typed is lost when it matches no id. The migration logs the count of cleared values; the organizer can pick a category again.
