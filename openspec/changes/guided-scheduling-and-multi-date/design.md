# Design

## Context

- **Schedule entry.** `PerformanceScheduleForm` renders five `PerformanceDateTimeField`s (native `datetime-local`) plus `PerformanceTimeZoneField`, a `WorkspaceSelect` over every IANA zone. `PerformanceSaleEditor` uses the same field for each offer's sale window and `PerformanceWorkspace` for `publishAt`. `performanceDateTime.ts` already converts wall time in a zone to an instant and reports nonexistent and ambiguous times; Admin `PerformanceOperationForm` reuses the field. `DESIGN_SYSTEM.md` says "Keep date and time fields on their native controls."
- **Performances.** Catalog `performances` (V12) holds schedule, `timezone`, sale window, `status`, `sales_suspended`, `sale_version` and `draft_version` (V16). The CHECK requires `sale_end_at <= starts_at` and `doors_open_at <= starts_at`. Stock pools are `performance_sale_groups` and seats (keyed by performance), ticket types are offers whose ids are global (Ticketing `performance_offers.id` references `ticket_types(id)`). Layout drafts copy template documents unchanged, so section and seat ids repeat across performances of one template.
- **Venues.** `venues(id, organization_id, name, address)` and `venue_spaces(id, venue_id, name)`; `POST /api/organizer/manage/v2/venues` creates a venue with exactly one space. There is no edit. Discovery derives a city from the address text. The sale snapshot carries `venueName` and `timezone`.
- **Release.** `POST .../performances/{id}/publication` requires `publishAt` in the future and not after sale start. Admin approval re-checks it and moves the review to `SCHEDULED`; the release job publishes due reviews (`performance_review_due` index), or marks them `SUPERSEDED`/`MISSED`.
- **Suspension.** For native performances `sales_suspended` is only set by `PerformanceDisruptions`: `confirm` (POSTPONE or CANCEL) publishes a new snapshot version with `suspended=true`; `resume` (POSTPONE only) publishes `suspended=false`. Ticketing `JdbcPerformanceCatalog` applies `sales_suspended` from a newer version, `PerformanceHolds.requireOnSale` refuses holds while suspended and `PerformanceAvailability` shows no offer. `confirm` refuses a performance that is already suspended. The Admin UI is `PerformanceOperationsPage` (`/api/admin/v2/performances/{id}/disruption`).
- **Organizer handoff.** The current *Postponement and cancellation handoff* requirement sends organizers to platform operations without any in-product request.

## Decisions

### Date and time picker

- New `components/date/DateTimePicker.tsx` (one instant) and `MultiDatePicker.tsx` (a set of days), both built on one `CalendarGrid`.
  - The calendar follows the WAI-ARIA date picker dialog pattern: a button opens a popover with a `grid`; arrows move by day, Page Up/Down by month, Home/End to week start/end, Enter or Space selects, Escape closes and returns focus. Week starts Monday for `vi` and the locale default otherwise. Days outside `min`/`max` are `aria-disabled`.
  - The time input is a combobox: it accepts typed `HH:mm` (24-hour for `vi`, locale format for `en`) and lists 15-minute steps. Any minute can be typed.
  - The field shows the zone label next to the value, for example "Asia/Ho Chi Minh (GMT+7)". Values are wall time in that zone and convert through the existing `resolvePerformanceDateTime`. Nonexistent and ambiguous wall times show the existing inline errors.
  - On narrow viewports the popover becomes a bottom sheet. The visible text field stays readable and copyable, and a typed date (`dd/MM/yyyy` or locale) is parsed as an alternative route.
- `PerformanceDateTimeField` keeps its props and renders `DateTimePicker`, so the schedule form, sale editor, release control and Admin operation form switch together. Legacy Admin concert forms are out of scope.
- **Smart defaults** on a new performance: picking a start fills doors 30 minutes before, end 2 hours after and sale end at the start, unless the organizer already changed those fields. Sale start has no default.
- **Time zone.** The schedule shows the zone as text with *Change time zone*, which opens the existing searchable select. A new performance takes the venue's default zone, otherwise `Asia/Ho_Chi_Minh`.
- `DESIGN_SYSTEM.md` rule becomes: "Use `DateTimePicker` for workspace dates and times and label the time zone. Native date inputs remain acceptable for buyer filters and report ranges."

### Bulk dates and duplication

- `POST /api/organizer/manage/v2/events/{id}/performances/bulk` with `{ startsAt: [instant…], sourcePerformanceId?, venueSpaceId?, durationMinutes, doorsBeforeMinutes, saleStartAt?, timezone }`. At most 30 dates per call, no duplicate start, all in the future. It creates all drafts in one transaction or none (422 lists the failing dates). Without a source, each draft gets the schedule only; with a source, each draft is a duplicate (below).
- `POST /api/organizer/manage/v2/performances/{id}/duplicate` with `{ startsAt }`. The source can be in any status of a native event owned by the organization. The copy is a `DRAFT` with:
  - the same venue space, time zone, per-account limit and visibility;
  - the end, doors, sale start and sale end shifted by `newStart - sourceStart`; offer sale windows shifted the same way. A shifted sale start already in the past becomes empty and the draft shows it as missing;
  - the source's layout draft document (or its published layout when it has no draft), stock pools with the same group and seat ids (they are performance-scoped), and offers with **new** ids and the same names, prices, currency and pool assignment;
  - no reviews, publications, guests, staff or disruptions.
- Both actions take the event lock and are audited. They do not change the event or other performances, so pending reviews of other performances are unaffected.

### Apply pricing to other dates

- `POST /api/organizer/manage/v2/performances/{id}/sale/apply` with `{ targets: [{ performanceId, expectedSaleVersion }] }`.
- A target qualifies when it is a `DRAFT` of the same event, has no `SUBMITTED` or `SCHEDULED` review, and its stock pools match the source by group id, kind and capacity. The target's offers are replaced by copies of the source offers (new ids for new offers, existing ids kept when the name and pool match), with windows shifted relative to the target start.
- All targets change in one transaction or none; a stale `expectedSaleVersion` returns 409 naming the performance. Released performances keep their existing sale-revision path.

### Venue library

- Migration columns on `venues`: `city text` (≤ 120), `timezone text` (default `Asia/Ho_Chi_Minh`), `capacity_hint integer` (> 0, nullable), `latitude`/`longitude numeric(9,6)` (nullable, both or neither). Existing rows backfill `city` from the address with the discovery rule.
- Endpoints: `PUT /venues/{id}` (name, address, city, timezone, capacityHint, expectedVersion via a new `venues.version`), `POST /venues/{id}/spaces`, `PUT /venues/{id}/spaces/{spaceId}`. Space names stay unique per venue.
- **Locked fields.** Name and address cannot change while a non-draft performance or a submitted or scheduled review uses one of the venue's spaces (409 `error.venue.in-use`); the UI explains this and offers *Create a new venue*. City, time zone, capacity hint and new spaces can always change. Space names follow the same lock as the venue name.
- Discovery uses `venues.city` when set and falls back to the address rule. The capacity hint is shown beside configured capacity in the map editor and warns (does not block) when configured capacity is larger.
- Coordinates: no raw input. See open question 1.

### Release now or at a scheduled time

- `PublishRequest` gains `releaseMode` (`SCHEDULED` default, or `ON_APPROVAL`). `publishAt` is required only for `SCHEDULED`.
- `performance_publication_reviews` gains `release_on_approval boolean NOT NULL DEFAULT false`; `publish_at` becomes nullable with `CHECK (release_on_approval OR publish_at IS NOT NULL)`.
- Approval of an `ON_APPROVAL` review sets `publish_at` to the approval time and requires the approval time to be no later than sale start and sale end in the future; otherwise approval is refused with `error.performance.release-window` and the organizer resubmits. The release job then publishes it on its next run. All other review rules (versions, supersede, hold, missed) are unchanged.
- The workspace shows *Release as soon as approved* or *Release at* with the picker and the existing "soon" and "at sale start" shortcuts. Review states show "Releases when approved" or "Releases at … (zone)".

### Pause and resume sales

- `performance_sales_pauses(id uuid PK, performance_id FK, reason text 1–500, paused_by, pause_version, resume_version, resumed_by, closed_reason ('RESUMED','SUPERSEDED'), created_at, closed_at)` with foreign keys to `performance_sale_publications(performance_id, version)` like `performance_disruptions`, and a unique index on `performance_id` where `closed_reason IS NULL`.
- `POST /api/organizer/manage/v2/performances/{id}/sales/pause` `{ actionId, reason }` (EVENTS grant). Allowed for a native `ON_SALE` or `SOLD_OUT` performance that is not suspended, has Ticketing's acknowledgement of its current version, has no open disruption and has not ended. Under the performance lock it publishes `sale_version + 1` with `suspended=true`, same status, sale and layout, through `PerformanceCatalog.snapshot` and `savePublication` (the code path disruption uses), and inserts the pause. Replaying an `actionId` returns the recorded pause.
- `POST .../sales/resume` `{ pauseId }` resumes only an open organizer pause when no disruption is open and the sale end is in the future. It publishes `sale_version + 1` with `suspended=false` and closes the pause `RESUMED`. Repeating it returns the closed pause.
- **Precedence.** `PerformanceDisruptions.confirm` today refuses a suspended performance. It will accept a performance whose only suspension is an open organizer pause, close that pause `SUPERSEDED` in the same transaction and continue as today. Organizer resume is refused while a disruption is open, so only platform operations end a disruption pause.
- **Guarantees.** No change in Ticketing. Buyer entry stops when Ticketing applies the suspended version: new holds are refused and offers show as unavailable, exactly as for a postponement pause. Existing holds, awaiting-payment orders, paid orders and tickets follow the existing suspension behaviour of ADR 0003. The workspace shows *Pausing…* or *Resuming…* until Ticketing acknowledges the version.
- Discovery keeps showing a paused performance with the existing "Sales paused" state (`CLOSED` availability).

### Cancel and postpone requests

- `performance_disruption_requests(id uuid PK, performance_id FK, organization_id, kind ('CANCEL','POSTPONE'), reason text 1–1000, proposed_starts_at, proposed_ends_at, proposed_doors_open_at, state ('REQUESTED','ACCEPTED','DECLINED','WITHDRAWN'), requested_by, requested_at, decided_by, decided_at, decision_reason, disruption_id FK performance_disruptions)`. One open (`REQUESTED`) request per performance. A postpone request requires a proposed start and end in the future.
- Organizer (EVENTS): `POST/GET /api/organizer/manage/v2/performances/{id}/disruption-requests`, `POST .../{requestId}/withdraw`. A request can be sent for a native `ON_SALE` or `SOLD_OUT` performance with no open disruption. The form offers *Also pause sales now*, which runs the pause in the same transaction.
- Admin: `GET /api/admin/v2/performance-disruption-requests?state=REQUESTED` and `POST .../{requestId}/decline` `{ reason }`. Accepting is done by confirming the existing disruption with an additive optional `requestId` on `PerformanceDisruptions.Command`; the confirmation marks the request `ACCEPTED` and links `disruption_id` in the same transaction. The operator may change kind, schedule and offers in the disruption form; the request is only the input.
- Admin `PerformanceOperationsPage` gains a *Requests* tab with a count badge; opening a request preloads the disruption form with its kind, reason and proposed schedule.
- The organizer sees the request state, the decision reason and, once accepted, the disruption state (`PAUSING`, `PAUSED`, `CANCELLED`, `RESUMED`) read from the existing status record. Email notifications are out of scope.

### Web structure

- The *Dates & venue* step lists performances with *Add dates* (multi-date dialog), *Duplicate* and *Apply pricing* row actions.
- A *Sales* panel per released performance shows availability, *Pause sales*/*Resume sales* with confirmation, and *Request cancellation or postponement*.
- *Venues* opens from the venue select (*Manage venues*) as a side panel with the list, edit form and spaces.
- Outcomes use toasts, validation stays inline, and new screens use the workspace records styles.

## Defaults to confirm in review

- At most 30 dates per bulk action; 15-minute time steps with any minute typed.
- Doors 30 minutes before start, 2-hour duration and sale end at the start as fill-in defaults; no default sale start.
- Duplicates and bulk dates are always drafts that need their own review; there is no bulk submit in this change.
- Apply pricing only to drafts with identical stock pools.
- Pause reason required (≤ 500 characters) and visible to platform operators, not buyers.
- Venue default time zone `Asia/Ho_Chi_Minh`; the capacity hint warns but never blocks.
- An `ON_APPROVAL` review whose sale start has passed at approval time is refused, not released late.

## Risks

- **Pause racing a disruption.** Both take the performance row lock and check open records, so one wins and the other is refused or supersedes the pause. Integration tests cover pause→disruption, disruption→pause and concurrent pause/resume.
- **Pause not yet applied.** Between the pause commit and Ticketing's acknowledgement buyers can still hold seats. The UI says *Pausing…*; this is the same window postponement has today.
- **Copying large maps.** Duplicating or bulk-copying a large layout writes many seat rows. Bulk is capped at 30 and runs in one transaction; a test with the largest seed template checks the time budget.
- **Picker accessibility regressions.** Native inputs were accessible by default. Component tests cover keyboard paths, labels and announcements, and the walkthrough checks screen widths 1440, 834 and 390.

## Rollout

1. Catalog migration and endpoints (venue, bulk, duplicate, apply, release mode, pause, requests), each behind the existing organizer grants.
2. Web picker components and `DESIGN_SYSTEM.md` rule; switch `PerformanceDateTimeField`.
3. Wizard actions, venue library, sales panel and Admin requests tab.
4. Rollback: the web can return to the native field by reverting step 2; new endpoints are additive and unused without the web.

## Open questions

1. **Venue coordinates.** Should TicketBox add a geocoding provider so organizers can set coordinates from an address? *Recommended: no; add the nullable columns and city now and defer coordinates until a provider is chosen.* Reason: there is no approved external provider, and raw coordinate entry is ruled out by the feedback doc.
2. **Organizer pause without review.** May an organizer pause and resume sales immediately, without platform approval? *Recommended: yes, immediately and audited, with platform disruption taking precedence.* Reason: stopping sales is the safe direction, resume only restores already-approved terms, and waiting for review defeats the purpose.
3. **Release as soon as approved.** Should organizers be able to submit with *Release as soon as approved* instead of a fixed time? *Recommended: yes, refusing approval if the sale start has already passed.* Reason: it removes the most common guess while keeping the "release before sale start" rule.
4. **Venue edits after release.** Should organizers be able to change a venue's name or address while a released performance uses it? *Recommended: no; lock name and address, allow city, time zone, capacity hint and new spaces.* Reason: the venue name is in sale snapshots, orders and tickets, and changing a venue after sale is a postponement-class change for operations.

## Decisions confirmed by the product owner (2026-11-27)

The product owner accepted the recommended answer to every open question:

- No geocoding provider. Coordinate columns are nullable, with no coordinate entry.
- Organizers pause and resume sales immediately, audited, and platform disruptions take precedence.
- "Release as soon as approved" is offered alongside a scheduled time. Approval is refused if the sale start has passed.
- Venue name and address are locked while a released or in-review performance uses the venue.
- Migration number: Catalog `V24` (built after Wave 2).
