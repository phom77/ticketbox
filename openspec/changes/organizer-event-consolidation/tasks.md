# Tasks

## 1. Catalog

- [x] 1.1 `V21__event_content.sql`: event content columns, `event_content_revisions`, `artist_pdf_jobs.event_id` with the exactly-one CHECK, `layout_backgrounds.source_performance_id ON DELETE SET NULL`. Move `ConcertContent`/`ConcertText` to a shared `content` domain package and update ArchitectureTest if needed.
- [x] 1.2 Event content use cases: draft edit with translations, age rating and refund policy; poster upload and removal on events (Cloudinary, after-commit cleanup); native artist-bio jobs and apply. Unit tests for validation, integration tests for poster rollback and organization scope.
- [x] 1.3 Content revisions: stage, submit, withdraw, Admin decide (approve applies under the event lock, idempotent repeat, stale decision refused), buyer cache invalidation. Integration tests for each state, a concurrent edit (409) and a pending revision alongside a performance release.
- [x] 1.4 Buyer reads: discovery card, `GET /api/v2/events/{id}` and checkout presentation return event poster, translations, bio, age rating and refund policy, falling back to the legacy concert. Tests for native, legacy and mixed events.
- [x] 1.5 Preview endpoints (organizer and Admin), no-store, organization-scoped. HTTP test proves another organization and anonymous callers get no draft content.
- [x] 1.6 Delete draft performance and draft event with version checks and audit. Tests: released, under review, scheduled, legacy-linked and another organization's event are refused; a shared background survives.
- [x] 1.7 Directory status rollup and filter (with the `PREPARING` alias). Tests for each status and the priority rule.
- [x] 1.8 Organizer legacy write guard and flag. HTTP tests: organizer writes refused, reads and guest import allowed, Admin unchanged. Update `docs/api.md` and the Catalog glossary (event content, content revision).

## 2. Web

- [ ] 2.1 API clients for content, poster, revisions, preview, delete and bio jobs.
- [ ] 2.2 Event details step: poster with crop preview, translations, age rating, refund policy, artist bio with PDF generation. Released events: staged revision editor and status line.
- [ ] 2.3 Preview route and header action. Buyer page and discovery card read event content.
- [ ] 2.4 Guests section per released performance (reuse guest import components with the performance id). Pre-release explanation.
- [ ] 2.5 Delete draft performance and event with named confirmations and toasts.
- [ ] 2.6 Directory: full status filter, poster thumbnail, rolled-up status, content-revision badge, row actions (Open, Preview, Report).
- [ ] 2.7 Read-only legacy summary in the native workspace. Organizer legacy routes become redirects, and every organizer link into `/organizer/concerts` is re-pointed.
- [ ] 2.8 Admin publication queue: Content changes tab with current/proposed comparison and decisions.
- [ ] 2.9 Unit tests for the new components and redirects. en/vi catalogs.

## 3. Verification

- [ ] 3.1 Catalog Maven verify and `verify-service-boundaries.py --service catalog`; web lint, test and build.
- [ ] 3.2 Compose stack walk-through: create a native event with poster, translations and bio → release → edit content → Admin approves → buyer page shows the new version; delete a draft performance; open a legacy concert read-only; import guests for a released performance. Screenshots at 1440, 834 and 390.
- [ ] 3.3 `openspec validate organizer-event-consolidation --type change --strict`.
