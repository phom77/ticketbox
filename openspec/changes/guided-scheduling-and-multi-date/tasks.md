# Tasks

## 1. Catalog

- [ ] 1.1 Migration at the next free Catalog version (V22 or later; check `db/migration` when the change merges and never edit V1–V21): `venues` gains `city`, `timezone`, `capacity_hint`, `latitude`/`longitude` (both or neither) and `version`, with a city backfill from the address; `performance_publication_reviews.release_on_approval` and nullable `publish_at` with its CHECK; `performance_sales_pauses`; `performance_disruption_requests`. Migration test on a database with V21 seed data.
- [ ] 1.2 Venue library: edit venue, add and rename spaces, name/address lock while a non-draft or reviewed performance uses the venue, optimistic version. Discovery reads `venues.city` with the address fallback. Integration tests for the lock, duplicate space names, organization scope and conflict.
- [ ] 1.3 Duplicate performance and bulk create (≤ 30, all or nothing): shifted schedule and offer windows, copied layout draft, stock pools with the same ids, offers with new ids, nothing else copied. Tests: released source unchanged, past shifted sale start left empty, legacy source refused, another organization refused, largest seed template within the time budget.
- [ ] 1.4 Apply pricing: matching stock pools, draft-only targets with no pending review, per-target `expectedSaleVersion`, one transaction. Tests for each refusal and the all-or-nothing rule.
- [ ] 1.5 Release mode: `releaseMode` on submit, approval of `ON_APPROVAL` records the approval time and refuses after sale start; release job unchanged. Tests for both modes, supersede after an edit and approval after sale start.
- [ ] 1.6 Pause and resume: `PerformanceSalesControls` use case with `actionId` replay, reusing `PerformanceCatalog.snapshot`/`savePublication`. `PerformanceDisruptions.confirm` accepts an organizer-paused performance and supersedes the pause. Tests: pause/resume publish consecutive versions; refusal when suspended, not acknowledged, ended or disrupted; concurrent pause and disruption; organizer resume refused during a disruption.
- [ ] 1.7 Disruption requests: organizer create/list/withdraw (optional pause in the same transaction), Admin queue and decline, additive `requestId` on the disruption command that marks the request accepted. HTTP tests for grants, platform authorization, one open request and organization scope.
- [ ] 1.8 Update ArchitectureTest if packages change, `docs/api.md` and the Catalog `GLOSSARY.md` (sales pause, disruption request, release on approval, venue space).
- [ ] 1.9 `scripts/mvnw-docker.sh -B -ntp -f services/catalog/pom.xml verify` and `python3 scripts/ci/verify-service-boundaries.py --service catalog`.

## 2. Ticketing and Check-in (verification only)

- [ ] 2.1 Ticketing integration test: a snapshot version with `salesSuspended=true` then `false` and no disruption refuses then accepts new holds, and an older replayed version is ignored. Check-in test that the same versions apply without affecting admission. `verify` and the boundary gate for both services. No contract or migration change.

## 3. Web

- [ ] 3.1 `CalendarGrid`, `DateTimePicker` and `MultiDatePicker` with keyboard support, zone label, typed entry, nonexistent/ambiguous errors and bottom-sheet layout on narrow screens. Vitest component tests for keyboard paths, labels, min/max and DST errors.
- [ ] 3.2 `PerformanceDateTimeField` renders the picker; schedule form gets smart defaults and *Change time zone*; sale editor windows and the release control use it. Update `frontend/DESIGN_SYSTEM.md` date and time rule.
- [ ] 3.3 *Add dates* dialog, *Duplicate* and *Apply pricing* actions in the Dates & venue step, with toasts and named errors.
- [ ] 3.4 Venue library panel: list, edit, spaces, lock explanation with *Create a new venue*, capacity hint warning in the map editor.
- [ ] 3.5 Release choice (*Release as soon as approved* / *Release at*) and review status text.
- [ ] 3.6 *Sales* panel: pause/resume with confirmation and *Pausing…*/*Resuming…* states; cancel/postpone request form, status and withdraw.
- [ ] 3.7 Admin performance operations *Requests* tab with count, decline with reason, and disruption form preloaded from a request.
- [ ] 3.8 API clients, en/vi catalogs, unit tests. `npm --prefix frontend run lint`, `test` and `build`.

## 4. Verification

- [ ] 4.1 Isolated Compose walkthrough: create an event, add three dates in one action, duplicate one with map and prices, apply pricing to another, edit a venue and add a space, submit one date with *Release as soon as approved* and one scheduled, approve both; buy a ticket; pause and resume sales and confirm buyers are blocked then allowed; request a postponement, accept it as Admin and see the organizer state. Screenshots at 1440, 834 and 390 px and a keyboard-only pass through the picker.
- [ ] 4.2 `openspec validate guided-scheduling-and-multi-date --type change --strict`.
