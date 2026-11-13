# Tasks

## 1. Catalog

- [x] 1.1 Add Catalog-owned translation storage and a Flyway migration. Keep original and compatibility values distinct, preserve legacy requests, and update localized fields within the existing authorization and row lock. Verify both single-language saves, mixed-language fields, explicit removal, invalid input, ownership and migration with Catalog service tests.
- [x] 1.2 Expose additive localized content in public list/detail, management and authorized preview. Document fields, omission and clearing semantics in `docs/api.md`. Verify old and new clients, public cache invalidation, draft privacy and compatibility with existing service snapshots through Catalog API tests.

## 2. Web

- [ ] 2.1 Initialize the web i18n runtime, install the shared selector and wire both Axios clients to the active language. Verify browser precedence and persistence, document language, booking state retention and feedback from an in-flight request in browser tests.
- [ ] 2.2 Move public, auth and buyer copy, labels and display formatting into translation resources. Verify both languages across browsing, account recovery, checkout, payment feedback and ticket access with browser checks and `npm run lint` and `npm run build` from `frontend/`.
- [ ] 2.3 Move operations copy, labels and display formatting into translation resources. Check both languages across organizer and administrator routes, preserve organization and role guards, and add CI validation of required message keys, placeholders and plural forms.
- [ ] 2.4 Add bilingual inputs to the concert create/edit forms and workspace and render localized text in public catalog, buyer concert views and private preview. Verify empty optional inputs, preservation of original content and unsaved edits, field-level fallback, and language switching without reloading the current concert.

## 3. Integration and verification

- [ ] 3.1 Run Catalog `clean verify`, its independent build gate, and the applicable shared CI checks. Run web lint/build, gateway split E2E and browser checks for organization workspace and checkout recovery, including responsive and keyboard operation of the selector. Validate this change with `openspec validate web-language-and-concert-translations --type change --strict`. Record executed checks and any operational gaps.
