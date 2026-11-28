# Proposal

## Why

Scheduling is the weakest step of the organizer wizard ([audit](../../../docs/product/organizer-workflow-audit.md), roadmap change C). Organizers type five raw `datetime-local` values per performance, pick a time zone from every IANA zone, add one date at a time and rebuild the map, stock pools and ticket types for every extra date. Venues cannot be edited and have one space. A release time must always be typed, there is no "release when approved", and once a performance is on sale the organizer cannot pause it or ask TicketBox to cancel or postpone it. The product owner approved a custom accessible calendar and time picker that shows the venue time zone and supports multi-date selection ([feedback](../../../docs/product/organizer-concert-ux-feedback.md), audit decision 4).

## What Changes

- **Calendar and time picker.** A custom accessible date picker (keyboard grid, month navigation, locale week start) and time picker replace raw date-time inputs in the organizer schedule, the ticket-type sale windows and the release time. Every value is shown and entered in the performance time zone, which is labelled next to the field. Smart defaults fill doors (30 minutes before), end (2 hours after start) and sale end (the start). `frontend/DESIGN_SYSTEM.md` replaces "keep native date and time fields" with the picker rule.
- **Add several dates at once.** Organizers pick several days on a calendar plus one start time and create one draft performance per day, optionally copying the setup of an existing performance.
- **Duplicate a performance.** One action creates a draft copy with the same venue space, map draft, stock pools and ticket types. Times and sale windows shift by the same offset as the new start.
- **Apply pricing to other dates.** Ticket types and prices of one performance can be copied to other draft performances of the event that use the same stock pools.
- **Venue library.** Organizers edit venues, add a city, a default time zone and a capacity hint, and add several spaces to one venue. Venues used by a released performance keep their buyer-visible name and address.
- **Release now or at a time.** Submitting for review offers *Release as soon as approved* or *Release at a scheduled time* in the performance time zone. Review and release rules are unchanged otherwise.
- **Pause and resume sales.** An organizer with the events grant can pause sales of an on-sale performance and resume a pause they started. Both reuse the existing `sales_suspended` publication path that postponement uses, so Ticketing guarantees are unchanged.
- **Request cancellation or postponement.** Organizers send a cancel or postpone request with a reason (and a proposed new schedule for postponement) to platform operations. An operator accepts it by running the existing performance disruption workflow or declines it with a reason. The organizer never commits a cancellation.

## Capabilities

### New Capabilities

- `organizer-scheduling`: guided date and time entry, bulk dates, duplication, pricing reuse, venue library and the release choice.
- `performance-sales-controls`: organizer pause and resume of a released performance, and cancel or postpone requests handled by platform operations.

### Modified Capabilities

- `organizer-event-publishing`: the postponement and cancellation handoff becomes an in-workspace request that platform operations accept or decline.

## Impact

- **Catalog:** one migration at the next free version (`V22` or later, assigned when the change merges; Wave 1 used V21): venue columns, `performance_publication_reviews.release_on_approval`, `performance_sales_pauses`, `performance_disruption_requests`. New organizer endpoints for bulk create, duplicate, apply pricing, venue edit and spaces, pause, resume and disruption requests; Admin endpoints for the request queue; additive `requestId` on the existing disruption command. No released migration is edited.
- **Ticketing, Check-in:** no code change. They already apply `salesSuspended` from a newer `catalog.performance-sale-snapshot.v2` version and ignore older ones; tests pin the pause and resume round trip.
- **Contracts:** none. Pause and resume publish ordinary snapshot versions.
- **Payment, Notification, Identity:** none.
- **Web:** `DateTimePicker` and `MultiDatePicker` components, schedule form, sale editor windows, release control, bulk-date and duplicate dialogs, apply-pricing dialog, venue library, performance *Sales* controls and request panel, Admin request queue in performance operations. `frontend/DESIGN_SYSTEM.md` date and time rule.
- **No new ADR.** Pause and resume reuse the publication and suspension mechanism of [ADR 0003](../../../docs/adr/0003-event-performance-and-inventory.md); requests are a Catalog-owned queue in front of the existing disruption workflow.
