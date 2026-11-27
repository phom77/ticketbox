# Tasks

## 1. Coordination

- [ ] 1.1 Record the product owner's answers to the open questions in design.md. Confirm with the redesign-staff-scanner-mobile owner that no staff API change is planned before its archive.

## 2. Check-in

- [ ] 2.1 Add `gates`, `guestsTotal` and `guestsCheckedIn` to `CheckinSummaryResponse` and `CheckinService.getCheckinSummary` (ports on `CheckinLogRepository` and the guest list repository; JDBC grouping by gate). Tests: counts per gate incl. null gate, guest counts, unchanged existing fields for Admin and organizer callers.
- [ ] 2.2 Add `GET /api/organizer/manage/v2/performances/{id}/checkins` (`EVENTS`, `ConcertAccess.isOwnedBy`, page size ≤ 50) returning a new organizer admission record without `qrCode` and `deviceId`. HTTP tests: owner with `EVENTS`, `FINANCE`-only refused, another organization's id not found, JSON contains no `qrCode`.
- [ ] 2.3 Extend `ScopedCheckinIntegrationTest` with the scoped-admission scenarios: assigned scan, revoked assignment denied on the next request, ticket of another performance rejected, organization mismatch, and concurrent scans of one ticket yielding one `SUCCESS`. Pin the current staff response JSON shapes (overview, history, scan) so scanner-facing changes fail the build. Keep `/api/staff/**` denied.
- [ ] 2.4 Add the new tests to `scripts/ci/java-suites.json` (checkin, `scoped-admission` group). Update `docs/api.md` and the Check-in `GLOSSARY.md` (assignment, recent admissions). Run `./mvnw -B -ntp -f services/checkin/pom.xml clean verify` and `python3 scripts/ci/verify-service-boundaries.py --service checkin`. No Flyway migration is expected; if one is needed it is `V15`.

## 3. Gateway

- [ ] 3.1 Route `/api/organizer/manage/v2/performances/{id}/checkins` to Check-in in `infra/nginx/gateway.conf` and check it with `docker compose config` and the smoke script.

## 4. Web staff app

- [ ] 4.1 Rewrite `api/management/staff.ts` onto `/api/v2/staff/performances` (list, overview, tickets, history, guests, guest check-in, scan) with the selected organization; remove the legacy `/api/staff/*` calls. Unit tests for paths and headers.
- [ ] 4.2 Route `/staff`, `/staff/check-in`, `/staff/guests`, `/staff/history` in `App.tsx` under `ProtectedRoute(STAFF)`, `OrganizationProvider` and `OperationsLayout mode="staff"`; replace the placeholder. Performance in `?performance=`, gate per performance in `sessionStorage`.
- [ ] 4.3 Rework the four staff pages: assigned-performance list with access states (no organization, no assignment, revoked, unavailable); check-in with manual entry, live camera (`getUserMedia` + `BarcodeDetector`), image fallback, single in-flight request and outcome states incl. "Not recorded"; guests with search and check-in; history without QR values. Replace `ConcertPicker` with a performance picker.
- [ ] 4.4 Move all staff page text to `src/i18n/{en,vi}` and format dates in the venue timezone. Component tests: each access state, `SUCCESS`, `FAILED`, 403 mid-session, network failure, repeated submit sends one request, guest already checked in.

## 5. Web organizer live view

- [ ] 5.1 `api/management/checkin.ts`: typed new summary fields and `getPerformanceAdmissions`.
- [ ] 5.2 `PerformanceCheckinPanel` in `PerformanceWorkspace` for acknowledged releases with `EVENTS`: progress, online/offline, per gate, guests, 10 newest admissions with staff names from `admission-staff`, 15-second visible-only refresh, stale state, retry, access message. en/vi catalogs and component tests (timer with fake timers, hidden tab, refresh failure, missing grant).

## 6. Verification

- [ ] 6.1 `npm --prefix frontend run lint`, `test` and `build`; `npm --prefix mobile-scanner run typecheck` to confirm the scanner still compiles against the unchanged API.
- [ ] 6.2 Compose walkthrough on an isolated project: invite a staff account with Admission, assign it to a released native performance, buy two tickets, admit one on the web (manual and image), retry the same ticket (rejected), check in a guest, revoke the assignment and see access removed; as an organizer with `EVENTS` watch the live view update and as `FINANCE`-only see no panel. Screenshots at 1440, 834 and 390 px.
- [ ] 6.3 `openspec validate native-performance-check-in --type change --strict`.
