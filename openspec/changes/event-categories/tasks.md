# Tasks

## 1. Catalog

- [ ] 1.1 Add the `EventCategory` domain value with the six ids and validate create/update. Return a translated 400 for unknown values. Unit-test accepted, null and rejected values.
- [ ] 1.2 Add the backfill migration (normalise, clear unknown, seed demo categories). Add a Catalog command for the legacy concert's mapped event category. Integration-test discovery `?category=concerts` and facets.

## 2. Web

- [ ] 2.1 Replace the organizer free-text category with a styled select (create, edit, legacy concert editor), using `eventCategories` labels in en/vi.
- [ ] 2.2 Show the translated category on event cards and event detail. Vitest: the web id list matches the six Catalog ids.

## 3. Verification

- [ ] 3.1 Catalog Maven verify and boundary gate, web lint/test/build, `openspec validate event-categories --type change --strict`. Screenshot the organizer form and a category page (3 widths, light, en).
