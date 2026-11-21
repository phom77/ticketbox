# Tasks

The [design](design.md) defines the numeric policy and compatibility rules. For each implementation task, add and run its focused regression before editing production code, then rerun it against the change.

## 1. Redis waiting-room lifecycle

- [x] 1.1 In `WaitingRoomService` and `RedisKeyConstants`, add the versioned pre-opening order and atomic publication for new rooms. Extend `WaitingRoomServiceIntegrationTest` to assert stable priority across duplicate joins, pre-opening customers ahead of late arrivals, retried publication, leave during the opening transition, and continued operation of an already populated legacy waiting room.
- [x] 1.2 In `WaitingRoomService`, enforce the 180-second waiting deadline for adaptive status, joins, cleanup and promotion, including renew versus cleanup and leave versus promotion. Extend the Redis integration tests to assert rank after middle leave, the original score before expiration, a fresh tail score after expiry or explicit leave, and the existing session token after reconnect. Cover an expired head before a cleanup tick and ensure a late cleanup cannot remove a renewed entry or replacement session.

## 2. Admission policy and purchase health

- [x] 2.1 Add the pure per-concert policy in `queue/domain` and its Redis-backed state in `queue/infrastructure`. Pin 75,000 → 42/s, start at 20/s and 2,880 sessions, target 6,048 sessions, cap and rate boundaries, peak reset, two healthy windows, insufficient data, and a half-rate response in focused tests with synthetic clock and health inputs.
- [x] 2.2 Capture qualifying reserve, checkout and payment technical outcomes at existing Ticketing boundaries. Feed completed intervals to the policy and sample the first-dispatch payment backlog once per shared interval. Tests distinguish normal stock conflicts, global overload, transport errors, stale data, and a queued dispatch from an order awaiting customer action. Verify no order, hold, payment, or message contract changes.
- [x] 2.3 Update the Redis grant operation and ready-concert scheduling to enforce the per-concert capacity and rate plus the shared dependency rate. Integration tests use multiple workers, a large and small concert, two competing backlogs, expired leases, lowered caps and lost notifications. Assert conservation of grants, one live session per owner, use of spare capacity, and continued checkout release after commit.

## 3. Browser and rollout compatibility

- [x] 3.1 Add the optional `pollAfterMs` field to `QueueStatusResponse`. In `QueueRealtimeService` and its web endpoint, enforce the authenticated top-1,000 subscription policy and handle a grant between status read and subscribe. Tests verify boundary positions 1,000/1,001 and 10,000/10,001, unranked waiting, private delivery, and the original response when adaptive mode is disabled.
- [x] 3.2 Update `frontend/src/api/queue.ts`, `WaitingRoomPage.tsx`, and `scripts/e2e/buyer-event-and-queue.mjs` to verify jittered status cadence, one socket near the front, HTTP recovery after a missed notification, legacy fallback, and timer/socket cleanup on leave, admission, and navigation. Preserve the staged waiting-room changes. Run `npm run lint`, `npm run build`, and the focused browser regression.
- [x] 3.3 Wire the enablement setting, presence duration and 250/170 shared request profile through Ticketing configuration and Compose. Document the enable and rollback order in the development guide. Verify the default and adaptive Compose configurations and that existing Redis queue scores, status responses and active sessions remain compatible across the switch.

## 4. Integration verification

- [x] 4.1 Run `./mvnw -B -ntp -f services/ticketing/pom.xml clean verify`, `python3 scripts/ci/verify-service-boundaries.py --service ticketing`, and `openspec validate adaptive-concert-admission --type change --strict`. Record the local two-concert fixture, browser evidence, and any unverified operational capacity separately.

### Local results

- Ticketing's Maven wrapper verified 91 tests on Java 21. The focused payment boundary suite also passed with the added transport failure case. The independent Ticketing image and ownership check passed.
- In real Redis, a concert with one entrant obtained a session alongside a concert with 30 waiters. Two workers serving two competing backlogs spent only the two shared grants available. Redis regressions also covered expiry, reconnect, and a reduced cap with already active sessions.
- Frontend lint and build passed. Playwright verified the three HTTP cadences, one near-front socket, HTTP recovery after a missed notification, and cleanup after leaving, admission, or navigation. Both Compose configurations and the strict OpenSpec check passed.
- The 75,000-buyer case was verified with policy calculations. Operational throughput under that load still needs a load test.
