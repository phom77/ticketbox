# Design

## Context

- **Staff accounts.** Identity creates a `STAFF` account when an invitation carries only the `ADMISSION` grant (`OrganizerOnboarding`). For a `STAFF` account, `GET /api/organizations` returns only memberships with `ADMISSION` (`OrganizationService.memberships`).
- **Assignment.** Check-in owns `staff_admission_assignments` (`V13`), keyed by the Check-in concert id, which is the performance id for native performances. Organizers with `EVENTS` assign and revoke staff through `/api/organizer/manage/v2/performances/{id}/staff` (`StaffAssignmentController`), shown in `PerformanceStaffPanel` once Check-in has acknowledged the publication. A revocation sets `revoked_at`.
- **Scoped staff API.** `ScopedStaffCheckinController` (`/api/v2/staff/performances`) requires role `STAFF` (`SecurityConfig`), `ADMISSION` in the `X-Organization-Id` organization (`@OrganizerPermission`), and an active assignment checked with a `FOR SHARE` lock on every request (`StaffAdmission.requireAssigned`). It offers list, overview, dataset, tickets, history, guests, guest check-in, scan and sync. `/api/staff/**` is `denyAll`.
- **Scanner.** The Expo app in `mobile-scanner/` already calls the scoped API for every organization with `ADMISSION` (`src/api/services/checkin.ts`), keeps an offline queue in SQLite and syncs it. Its redesign (`redesign-staff-scanner-mobile`) has 8 of 12 tasks done; 1.3 (drawer), 2.1 (camera UI), 3.3 (scanner guide) and 4.2 (Android walkthrough) remain and are UI or device work.
- **Web staff pages.** `pages/staff/*` exist but are unrouted; `App.tsx` renders a placeholder for `/staff/*`. They call `/api/staff/*` (denied), use `ConcertPicker`, hard-code Vietnamese text and decode QR codes from an uploaded image with `BarcodeDetector`. `OperationsLayout` already has a `staff` mode with Overview, Scan QR, Guests and History.
- **Organizer data.** `GET /api/organizer/manage/concerts/{id}/checkin-summary` (`EVENTS`, owner check) works for a native performance because the Check-in concert id equals the performance id. Overview already uses it for the next seven days (change E). There is no organizer endpoint for individual admissions. `checkin_logs` has `(concert_id, checked_at DESC)` and `guest_lists` has `(concert_id, checked_in_at)` indexes.

## Decisions

### Web app versus scanner

| Concern | Mobile scanner (redesign-staff-scanner-mobile) | Web staff app (this change) |
| --- | --- | --- |
| Primary use | Gate scanning on Android, high volume | Desk and backup: guest desk, help desk, a laptop or tablet at a side door, supervisors |
| Input | Camera first, manual entry | Manual entry first; live camera where `BarcodeDetector` and `getUserMedia` exist; image fallback |
| Offline | Downloads the dataset, records `PENDING` scans, syncs later | **Online only.** No dataset download, no queue, no sync calls |
| Outcome labels | Confirmed, pending, rejected, access error | Confirmed, rejected, access error, not recorded (Check-in unreachable). Never pending |
| API | `/api/v2/staff/performances/...` incl. `checkin-dataset` and `sync` | Same routes except `checkin-dataset` and `sync` |
| Device id | Scanner device id | `staff-web-<uuid>` (existing cookie in `staffPageUtils`) |

Both clients rely on Check-in's central decision, so two devices admitting the same ticket still produce one confirmed admission (event-performances spec, "Soát cùng vé hai lần"). The web app reuses the scanner's wording for the same outcomes so staff see the same terms on both clients.

### Staff API is frozen for the scanner

The web app is a read-and-scan consumer of the existing scoped staff routes. This change does not alter their paths, request bodies, response shapes, status codes or messages. Anything the web needs that the API lacks goes on organizer endpoints or is deferred.

### Web staff routing and access states

- `/staff/*` renders `OrganizationProvider` and `OperationsLayout mode="staff"` for role `STAFF`, the same pattern as the organizer workspace. Routes: `/staff` (assigned performances), `/staff/check-in`, `/staff/guests`, `/staff/history`. The selected performance is in the URL (`?performance=<id>`) so links and reloads keep it; the gate is remembered per performance in `sessionStorage`.
- Access states, each with a next action:
  - No organization with `ADMISSION`: explain that an organizer must invite the account with the Admission permission.
  - Organization selected, no assigned performance: explain that the organizer assigns staff in *Event › performance › Staff*.
  - Assignment revoked or organization access lost mid-session (HTTP 401/403 on a scoped call): stop scanning, clear the selected performance and show "You no longer have access to this performance".
  - Check-in unavailable (network failure, 5xx): keep the page, show retry; no admission is shown.
- The performance list shows only assigned performances, sorted by start time, with venue, start time in the venue timezone and status. Past performances older than one day are collapsed under *Earlier*.

### Online admission on the web

- One submission at a time; repeated reads of the same code while a request runs are ignored, and the camera ignores the same code for 3 seconds after a result so a held ticket is not resubmitted.
- `SUCCESS` shows "Allowed in" with ticket reference and ticket type when present. `FAILED` shows "Not accepted" with the server message. 401/403 shows the access state. A network failure or timeout shows "Not recorded — Check-in could not be reached. Try again or use the scanner app" and keeps the entered code.
- The live camera stops when the page is hidden, the route changes or a dialog opens. If camera permission is denied or the API is missing, the page explains it and keeps manual entry and the image fallback.

### Guests and history

- *Guests*: paged list from `GET .../{id}/guests`, client-side search by name or phone within loaded pages, and *Check in* calling `POST .../guests/{guestId}/check-in` with the current gate. An already checked-in guest shows when and at which gate.
- *History*: `GET .../{id}/checkins`, newest first, 20 per page, showing time, gate, ticket reference, ticket type and online/offline. The QR value is never shown on the web.
- *Overview* per performance (`GET .../{id}/overview`): admitted / valid tickets and last dataset update.

### Organizer live check-in view

- A *Check-in* panel in `PerformanceWorkspace`, next to `PerformanceStaffPanel`, for performances whose publication Check-in acknowledged. It needs `EVENTS`; without it the panel is absent.
- Content: admitted / valid tickets with a progress bar, online and offline admissions, admissions per gate, guests checked in of total, the 10 most recent admissions (time, gate, ticket reference, ticket type, staff name resolved through `GET /api/organizations/{id}/admission-staff`, falling back to "Staff member"), and "Updated hh:mm:ss".
- Refresh: every 15 seconds while the document is visible and the panel is mounted, plus a *Refresh* button. A failed refresh keeps the last figures, marks them stale and shows retry. A value of 0 appears only when the response confirms it.
- **Check-in API, additive:**
  - `CheckinSummaryResponse` gains `gates: [{gate, checkedIn, latestCheckedAt}]` (null gate reported as `null`, labelled "No gate" by the web), `guestsTotal` and `guestsCheckedIn`. Existing fields are unchanged, so Overview and Admin keep working.
  - `GET /api/organizer/manage/v2/performances/{id}/checkins?page&size` (`EVENTS`, `ConcertAccess.isOwnedBy`; another organization's id is not found). It returns `CheckinHistoryResponse` fields except `qrCode` and `deviceId`, sorted by `checkedAt DESC, id`, size at most 50. A new response record keeps the staff DTO unchanged.
  - Both read from existing indexes; no migration.

### Legacy concerts

The web staff app lists assigned performances only. Legacy concerts have no assignment UI (the organizer sees them read-only after change A) and the legacy staff routes stay denied. The live view appears only in the native workspace.

## Deferred until redesign-staff-scanner-mobile completes

- **Gate rollout.** Real-device acceptance at a venue, go/no-go thresholds and the staging rehearsal (scanner task 4.2, redesign-concert-and-seating task 6.4, roadmap A1/A5). The web app is verified on Compose only.
- **Scanner changes.** Any change to the scanner's screens, SQLite schema, offline queue or its use of the staff API. A "Open in scanner app" deep link from the web is deferred until the scanner navigation (task 1.3) lands.
- **Staff API changes.** New fields or routes on `/api/v2/staff/...` (for example a per-staff history filter or structured rejection reasons such as `USED`) wait until the scanner change is archived, so both clients can adopt them together.
- **Shifts, gate-level permissions and re-entry.** Need their own authorization design (redesign-concert-and-seating design, "Soát vé tại địa điểm").
- **Scanner guide.** `mobile-scanner/README.md` updates stay with scanner task 3.3; this change documents only the web app in `docs/development.md`.

## Defaults to confirm in review

- Live view refresh interval of 15 seconds while visible; no WebSocket.
- The web camera ignores a repeated code for 3 seconds after a result.
- Recent admissions list shows the 10 newest on the panel; the endpoint pages up to 50.
- Gate is free text up to 100 characters (the API limit), pre-filled with the last gate used for that performance, `WEB` the first time.
- Performances that ended more than one day ago are collapsed under *Earlier* in the staff list but still openable for history.
- Admins keep the existing Admin check-in summary; this change adds no Admin view.

## Risks

- **Two clients, one API.** A web change could break the scanner. Mitigation: no staff API change; Check-in tests pin the current staff response shapes; the scanner typecheck runs in verification.
- **Staff believes the web app works offline.** Mitigation: "Not recorded" is distinct in text, icon and colour from "Allowed in", and points to the scanner app.
- **Polling load.** One summary and one history call per open panel every 15 seconds, paused when hidden; both are indexed reads.
- **Browser camera support.** `BarcodeDetector` is missing in some browsers (Firefox, older Safari). Manual entry and the image fallback always remain.

## Rollout

1. Deploy Check-in with the additive summary fields and the organizer history endpoint, and the gateway route.
2. Deploy the web: staff routes, rewritten staff client, live view.
3. No data migration and no feature flag. Rollback is a web revert; the Check-in additions are unused without the web.

## Open questions

1. **Should the web staff app scan at the gate with the camera, or be a desk and backup tool?** Recommended: desk and backup, online only, with the live camera offered where the browser supports it; the Android scanner stays the primary gate tool. Reason: only the scanner has the offline queue, and two offline mechanisms would risk double or unconfirmed admissions.
2. **Should organizers see individual admissions or only totals?** Recommended: totals plus recent admissions with ticket reference, gate, time and staff name, never the QR value. Reason: organizers need it to resolve disputes at the door, and the QR value is an admission credential.
3. **Should organizer members with `EVENTS` be able to check tickets in on the web without a `STAFF` account?** Recommended: no; admission stays with assigned `STAFF` accounts. Reason: it keeps the approved scoped-admission model and needs no Identity or security change.
4. **Should guest check-ins count toward the admission progress?** Recommended: show them separately (guests checked in of total) and keep the progress bar for tickets only. Reason: guests are not tickets, and mixing them would make the progress exceed sold capacity.

## Decisions confirmed by the product owner (2026-11-27)

The product owner accepted the recommended answer to every open question:

- The web staff app is a desk and backup tool, online only, with live camera scanning where the browser supports it. The Android scanner stays the primary gate tool.
- Organizers see totals plus recent admissions (ticket reference, gate, time, staff name, never the QR value).
- Guests are counted separately from ticket progress.
- Admission stays with assigned `STAFF` accounts.
- Scanner-dependent items are deferred until redesign-staff-scanner-mobile completes.
- Migration number, if needed: Check-in `V15`.
