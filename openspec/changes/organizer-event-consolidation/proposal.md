# Proposal

## Why

Organizers work in two event systems. The native event → performance workspace (`/organizer/events`) has the guided wizard, the seat-map editor and pricing per performance, but its events go live with no poster, translations or artist bio and cannot be corrected after the first release. The legacy one-date concert workspace (`/organizer/concerts`, ticket types, guests, artist bio) holds those features but is hidden from navigation, uses a different timezone rule and creates a second kind of event. The product owner approved retiring the legacy organizer screens and finishing the native workflow ([audit](../../../docs/product/organizer-workflow-audit.md), roadmap change A).

## What Changes

- **Event content on native events.** Poster upload, Vietnamese and English title and description, artist bio (including the existing AI-from-PDF flow), age rating and refund-policy text live on the event and appear on the buyer page and discovery cards.
- **Reviewed edits after release.** Event content of a released event can be edited. The edit is staged as one pending content revision per event; buyers keep the current version until a platform reviewer approves it. This implements the existing *Reviewed revisions and publication holds* requirement for native events.
- **Buyer preview for native events.** Organizers open a private buyer-page preview of any event or performance, before and after release.
- **Guests per performance.** The workspace has a Guests section for each released performance using the existing Check-in guest import. Before first release it explains when guest import becomes available.
- **Delete drafts.** Organizers can delete a draft performance or an event whose performances are all drafts and not under review.
- **Event directory.** The status filter covers Draft, In review, Changes requested, Scheduled, On sale, Sold out, Past and Cancelled. Each row shows the poster, a rolled-up status, the next date and the number of performances.
- **Legacy concerts become read-only for organizers.** Organizers can no longer create legacy concerts or change their ticket types, bio or details. Existing legacy concerts open in the native workspace as a read-only summary with guests, orders and reports, and a clear route to TicketBox support for changes. `/organizer/concerts/*`, `/organizer/ticket-types`, `/organizer/guests` and `/organizer/artist-bio` redirect into `/organizer/events`. The Admin legacy workspace is unchanged.

## Capabilities

### New Capabilities

- `organizer-event-content`: event media, translations, bio, buyer notes, reviewed content revisions and preview for native events.

### Modified Capabilities

- `operations-workspaces`: one organizer creation and management path, the event directory and draft deletion; legacy concerts read-only for organizers.
- `organizer-event-publishing`: preview covers native events; content revisions after release.

## Impact

- **Catalog:** migration `V21__event_content.sql` (event content columns, `event_content_revisions`, `artist_pdf_jobs.event_id`, cascade fix on `layout_backgrounds`), native content, poster, bio, preview, delete and revision endpoints, Admin revision decision, directory status rollup, organizer write endpoints for legacy concerts refused.
- **Check-in:** none. Guest import already accepts a released performance id.
- **Ticketing, Payment, Notification, contracts:** none. Buyer content is read from Catalog.
- **Web:** event wizard content step, preview, Guests section, directory, read-only legacy summary, Admin content-revision queue, organizer legacy routes replaced by redirects.
- **No new architecture decision.** Content revisions reuse the staged-edit pattern of `concert_publication_edits` inside Catalog.
