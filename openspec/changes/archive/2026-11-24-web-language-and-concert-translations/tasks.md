# Tasks

## 1. Catalog

- [x] 1.1 Add Catalog-owned translation storage and a Flyway migration. Keep original and compatibility values distinct, preserve legacy requests, and update localized fields within the existing authorization and row lock. Verify both single-language saves, mixed-language fields, explicit removal, invalid input, ownership and migration with Catalog service tests.
- [x] 1.2 Expose additive localized content in public list/detail, management and authorized preview. Document fields, omission and clearing semantics in `docs/api.md`. Verify old and new clients, public cache invalidation, draft privacy and compatibility with existing service snapshots through Catalog API tests.

## 2. Web

- [x] 2.1 Initialize the web i18n runtime, install the shared selector and wire both Axios clients to the active language. Verify browser precedence and persistence, document language, booking state retention and feedback from an in-flight request in browser tests.
- [x] 2.2 Move public, auth and buyer copy, labels and display formatting into translation resources. Verify both languages across browsing, account recovery, checkout, payment feedback and ticket access with browser checks and `npm run lint` and `npm run build` from `frontend/`.
- [x] 2.3 Move operations copy, labels and display formatting into translation resources. Check both languages across organizer and administrator routes, preserve organization and role guards, and add CI validation of required message keys, placeholders and plural forms.
- [x] 2.4 Add bilingual inputs to the concert create/edit forms and workspace and render localized text in public catalog, buyer concert views and private preview. Verify empty optional inputs, preservation of original content and unsaved edits, field-level fallback, and language switching without reloading the current concert.

## 3. Integration and verification

- [x] 3.1 Run Catalog `clean verify`, its independent build gate, and the applicable shared CI checks. Run web lint/build, gateway split E2E and browser checks for organization workspace and checkout recovery, including responsive and keyboard operation of the selector. Validate this change with `openspec validate web-language-and-concert-translations --type change --strict`. Record executed checks and any operational gaps.

## Verification

- Catalog Maven verification passed 35 tests. The Catalog container built independently and passed source and package ownership checks.
- The six-service Maven reactor passed 220 tests. The Python CI checks passed 12 tests and both Compose configurations validated.
- Web lint and build passed. Lint checked 1,473 message keys and reported four React warnings. Vite reported a bundle-size warning.
- Gateway split E2E passed 16 checks, including private preview, translation edits and cache invalidation. Chromium passed 20 checkout recovery checks, the language and HTTP feedback checks, and the organizer workflow through published event, payment and issued QR. Responsive checks covered desktop, tablet and mobile.
- OpenSpec strict validation passed. Verification used local fixtures and MOCK payment. Staging and live payment were outside this run.
