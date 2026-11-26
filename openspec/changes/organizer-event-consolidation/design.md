# Design

## Context

- Catalog owns events (`events`, V12) and performances. Native events only have `title`, `description`, `category` and `draft_version`. Legacy concerts keep `poster_url`/`poster_public_id` (Cloudinary), `localized_content` (V11, `ConcertContent` JSON with `vi` and `en`) and `artist_bio`. Every legacy concert has an event and a performance with the same id (trigger `link_legacy_concert_to_event`).
- `PerformanceCatalog.updateDraftEvent` refuses event edits once any performance is not DRAFT. The native publication review only handles DRAFT performances.
- Discovery (`JdbcPerformanceStore`) and public event detail read poster, translations and bio only from `concerts`, so native events show none of them. `useEventDetail.eventModel()` hard-codes `posterUrl: null` and `artistBio: null`.
- Check-in learns about a native performance from its publication snapshot. Guest endpoints are keyed by the Check-in concert id, which is the performance id for native performances and the concert id for legacy concerts.
- There are no native delete endpoints. `layout_backgrounds.source_performance_id` has no cascade and blocks deleting a performance.
- The organizer and Admin share the legacy pages (`AdminConcertsPage`, `ConcertWorkspacePage`, `AdminTicketTypesPage`, `AdminGuestImportsPage`, `AdminArtistBioPage`) through `apiScope`.

## Decisions

### Event content model

- `V21__event_content.sql` adds to `events`: `poster_url`, `poster_public_id`, `localized_content text`, `artist_bio text`, `age_rating text` (`ALL`, `13+`, `16+`, `18+` or null) and `refund_policy text` (at most 2,000 characters).
- `localized_content` uses the same JSON shape as concerts. `events.title` and `events.description` stay the original text, as `Concert` already does with `compatibilityText`. The `ConcertContent`/`ConcertText` value objects move to a Catalog `content` domain package used by both capabilities.
- Posters use the existing Cloudinary adapter (`CloudinaryPosterStorage`). Uploads are named `event-<eventId>-<uuid>`, replaced assets are deleted after commit and orphaned uploads are deleted on rollback, as in `ConcertPosterService`.
- Buyer reads use `COALESCE(event value, legacy concert value)`, so legacy rows keep working with no data copy. Discovery cards, `GET /api/v2/events/{id}`, checkout presentation and order posters read the event poster.
- `artist_pdf_jobs` gains a nullable `event_id`. `concert_id` becomes nullable, with a CHECK that exactly one of them is set. Native jobs store PDFs under `<storageRoot>/events/<eventId>/`. Applying a result writes `events.artist_bio`, or stages it when the event has a released performance.

### Reviewed content revisions

- `event_content_revisions` has one row per event: `event_id` (PK), `base_draft_version`, `details jsonb` (title, description, translations, artist bio, age rating, refund policy), `poster_url`, `poster_public_id`, `state` (`DRAFTING`, `SUBMITTED`, `CHANGES_REQUESTED`, `REJECTED`, `APPROVED`), submitter, reviewer, reason and timestamps.
- Before any performance is released, edits write the event directly, as today.
- After release, edits go to the revision in `DRAFTING`. The organizer submits it. A platform reviewer approves, requests changes or rejects. Approval applies the details to `events` under the event lock, bumps `draft_version`, invalidates the buyer cache after commit and marks the revision `APPROVED`. A replaced staged poster is deleted when the revision is discarded.
- A decision is accepted only for the submitted revision. Repeating a completed decision returns the recorded outcome.
- Content revisions are separate from performance publication reviews, so a pending content change does not block a performance release, and the reverse. Schedule and ticket changes after release stay with their existing paths (sale revisions, disruption).
- Admin reviews content revisions in a *Content changes* tab of the existing publication queue, with a side-by-side current/proposed view.

### Preview

`GET /api/organizer/manage/v2/events/{id}/preview` (EVENTS) and the Admin equivalent return the same buyer-shaped detail as the public endpoint, including draft performances and the staged revision when `revision=true`. The response is `Cache-Control: no-store`. The web route `/organizer/events/:eventId/preview` renders `EventDetailPage` with the preview banner.

### Delete drafts

- `DELETE /api/organizer/manage/v2/performances/{id}` succeeds when the performance is DRAFT, has no SUBMITTED or SCHEDULED review and was never released. Draft data cascades. V21 changes `layout_backgrounds.source_performance_id` to `ON DELETE SET NULL` so shared backgrounds and templates survive.
- `DELETE /api/organizer/manage/v2/events/{id}` succeeds when every performance meets the same rule, then removes the event, its performances and its native artist-bio jobs and poster.
- Both require the caller's current `draft_version` (409 on mismatch) and are audited. Legacy-linked events cannot be deleted by organizers.

### Directory status

`WorkspaceOperationsStore.EventStatus` becomes `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `SCHEDULED`, `ON_SALE`, `SOLD_OUT`, `PAST`, `CANCELLED`. `PREPARING` stays accepted as an alias for draft, in review or changes requested.

| Performance status | Rule |
|---|---|
| Draft | DRAFT with no review, or the last review was superseded, rejected, missed or held |
| In review | latest review SUBMITTED |
| Changes requested | latest review CHANGES_REQUESTED |
| Scheduled | latest review SCHEDULED |
| On sale | ON_SALE, released and not suspended |
| Sold out | SOLD_OUT |
| Past | COMPLETED, or the performance has ended |
| Cancelled | CANCELLED |

- A filter matches an event when any of its performances has that status.
- The row shows the most urgent status in this order: Changes requested, In review, On sale, Scheduled, Sold out, Draft, Past, Cancelled. A pending content revision adds a *Content change in review* badge.

### Legacy concerts for organizers

- **Refused:** organizer write endpoints for legacy concerts (create, update, status, poster, category, ticket-type writes, legacy artist-bio writes) return 403 `error.concert.organizer-legacy-read-only`. Organizer reads stay.
- **Unchanged:** Admin endpoints, and guest import for legacy concerts. Guest import is an operation, not a content edit.
- **Workspace:** the native workspace replaces the "open legacy workspace" link with a read-only summary: schedule, venue, ticket types and prices, publication state, guests, orders and report links, and *Request a change* (explains that TicketBox support makes changes, with the support contact).
- **Redirects:** `/organizer/concerts/:id[/preview]` goes to `/organizer/events/:id` (the event id equals the legacy concert id). `/organizer/concerts`, `/organizer/ticket-types`, `/organizer/guests` and `/organizer/artist-bio` go to `/organizer/events`. Links in the directory, Overview, reports and revenue page now point into `/organizer/events`.

### Web

- The **Event info** step becomes *Event details*: poster with crop preview (3:4 card and 16:9 banner from the same image), title and description with the existing `ConcertTextFields` translation editor, age rating, refund policy, artist bio with *Generate from PDF* (reuses the `AdminArtistBioPage` job components).
- After release the step shows the live version, *Edit* opens the staged revision, and a status line shows Drafting, In review, Changes requested (with reason) or Rejected.
- The performance switcher gains *Guests* (released performances) and *Delete draft*. The header gains *Preview*.
- New and changed screens use the workspace records styles and toasts for outcomes, with inline text for validation.

## Defaults to confirm in review

- Age rating values: All ages, 13+, 16+, 18+.
- A content revision can include the poster; the staged poster is visible only in preview and review.
- Deleted drafts are not recoverable. The confirmation names the event or performance.
- Guest import stays unavailable before the first release.

## Risks

- **Two content sources during transition.** Legacy rows keep their content on `concerts`. Buyer reads coalesce in one query helper, covered by tests for native, legacy and mixed events.
- **Cloudinary orphans.** Staged posters for discarded revisions are deleted. A nightly job removing assets with no row is out of scope.
- **Organizer workflows for live legacy concerts move to TicketBox support.** The read-only summary names the support route. Admin can still use the legacy workspace.

## Rollout

1. Catalog migration and endpoints, with the organizer legacy write guard behind `TICKETBOX_ORGANIZER_LEGACY_READ_ONLY` (default true, false for rollback).
2. Web: content step, preview, guests, delete, directory, Admin queue.
3. Redirects and removal of organizer legacy routes.
