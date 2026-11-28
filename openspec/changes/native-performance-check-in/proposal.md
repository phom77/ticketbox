# Proposal

## Why

Organizers can assign staff to a released native performance, but assigned staff have nothing to use on the web. `/staff/*` renders a "check-in is not open yet" placeholder, and the existing `Staff{Overview,CheckIn,Guests,History}Page` components are unrouted and still call the legacy `/api/staff/*` routes that Check-in denies ([scoped-admission-access](../../specs/scoped-admission-access/spec.md)). Organizers also have no way to watch admission for one performance while doors are open; the Overview only shows check-in progress for the next seven days. The product owner approved this as roadmap change G ([audit](../../../docs/product/organizer-workflow-audit.md), screen inventory "Staff check-in /staff/*" and "Performance operations").

The Android scanner redesign ([redesign-staff-scanner-mobile](../redesign-staff-scanner-mobile/)) is in flight and already uses the performance-scoped API `/api/v2/staff/performances/{id}/...`. This change routes the web staff app onto the same API without changing it, and leaves gate scanning with an offline queue to the scanner.

## What Changes

- **Web staff app, routed.** `/staff`, `/staff/check-in`, `/staff/guests` and `/staff/history` render inside the staff workspace with organization selection. They list only the performances the signed-in staff account is assigned to, through the existing scoped Check-in routes, with `ADMISSION` in the selected organization.
- **Online admission on the web.** Manual code entry, a live camera reader where the browser supports it, and an image fallback. A green "Allowed in" result appears only after Check-in confirms the scan. The web never queues scans offline: when Check-in cannot be reached, nothing is recorded and the page says so.
- **Guest desk and history.** Assigned staff search and check in guests of the performance, and read the performance's admission history with ticket reference, gate and time.
- **Clear access states.** No organization with `ADMISSION`, no assigned performance, revoked assignment and unavailable Check-in each have their own explanation and next step.
- **Organizer live check-in view.** The native performance workspace gains a *Check-in* panel for released performances: admitted versus valid tickets, online and offline counts, admissions per gate, guests checked in, recent admissions and the time of the last update, refreshed while the page is visible. It requires `EVENTS`.
- **Check-in API, additive only.** The organizer check-in summary gains per-gate and guest counts. A new organizer endpoint returns recent admissions for one performance without QR payloads. The staff API (`/api/v2/staff/...`) and its response shapes stay unchanged for the scanner.
- **i18n.** The staff pages move their hard-coded Vietnamese text into the en/vi catalogs.

## Capabilities

### New Capabilities

- `staff-web-check-in`: the web staff app for assigned performances: access states, online admission, guest check-in and history.
- `performance-check-in-monitoring`: the organizer's live check-in view per performance.

### Modified Capabilities

- `scoped-admission-access`: adds the requirement for performance-scoped staff admission that both the scanner and the web app rely on.

## Impact

- **Check-in:** additive fields on `CheckinSummaryResponse` (`gates`, `guestsTotal`, `guestsCheckedIn`); new `GET /api/organizer/manage/v2/performances/{id}/checkins` (`EVENTS`, owned performance, no `qrCode`). No migration is expected (latest is `V14`); if the gate grouping needs an index it is added as `V15`. Legacy `/api/staff/**` stays `denyAll`.
- **Gateway:** `infra/nginx/gateway.conf` routes `/api/organizer/manage/v2/performances/{id}/checkins` to Check-in.
- **Web:** staff routes in `App.tsx` under `OrganizationProvider` and `OperationsLayout mode="staff"`; `api/management/staff.ts` rewritten onto the v2 routes; staff pages migrated to i18n; new `PerformanceCheckinPanel` in `PerformanceWorkspace`.
- **Identity, Catalog, Ticketing, Payment, Notification, contracts:** none.
- **Mobile scanner:** none. Its API, SQLite schema and offline behaviour are untouched. Items that wait for the scanner change are listed in [design.md](design.md#deferred-until-redesign-staff-scanner-mobile-completes).
