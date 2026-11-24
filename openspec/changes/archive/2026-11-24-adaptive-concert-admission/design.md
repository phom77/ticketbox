# Design

## Context

`WaitingRoomService` owns the pre-opening draw, waiting order, and shopping-session grants. It currently reads all pre-opening entrants into Java at the draw. The same service already uses a Redis script to move the head into a time-limited shopping session atomically. The web waiting room starts SockJS and periodic HTTP status checks after joining. The [spec](specs/concert-admission/spec.md) describes the new behavior.

## Scope

Reuse Ticketing, its current Redis instance, and the browser's HTTP and private STOMP paths. Keep catalog ownership, the existing Redis key meanings, HTTP response fields, frontend copy, order and hold transactions, and event identifiers. Admission ends at order commit, explicit leave, or the existing shopping-session expiry. The 120-second planning value estimates occupancy. The shopping-session expiry remains ten minutes by default.

## Decisions

### Opening order and waiting presence

- When the first buyer joins a new pre-opening waiting room, initialize its draw seed and format marker once in Redis. Use a stable secret-seeded random priority for each account and concert. Use a Redis sorted set with a priority in the exact integer range `[0, 2^52)`. The same account cannot reroll its priority by rejoining. Keep ranks private before opening.
- At opening, atomically publish the already-ordered waiting set, set the late-entrant sequence to the end of the reserved score range, and mark the draw ready. Late arrivals then take increasing scores above that range. Keep the existing draw path for a waiting room populated before the new format was enabled. Reuse the ready marker so retries cannot republish the draw or overwrite a ready queue.
- Store a waiting deadline by user in `queue:presence:<concertId>`, using the existing sorted set and Redis time. Successful waiting status renews it by 180 seconds. Check the deadline and membership together when renewing or granting. Cleanup compares the live deadline before deleting. Explicit leave removes the entry immediately. The `queue:left` marker only communicates that the place ended. Reconnecting to an active shopping session recovers its existing token and deadline.

### Per-concert admission and dependency limits

| Setting | Value in the adaptive profile |
| --- | --- |
| Desired admission rate | `clamp(ceil(peakLiveWaiting / 1800), 5, 60)` buyers/second |
| Initial rate | `min(desiredRate, 20)` buyers/second |
| Active-session cap | `min(10000, ceil(currentRate * 120 * 1.2))` |
| Local burst | One second of the current rate |
| Control interval | 15 seconds |

Track the peak waiting count for the current continuous backlog and reset it once the backlog drains. Ticketing uses 120 seconds as the initial occupancy assumption. For 75,000 waiters, the target is 42 buyers per second. Healthy ramp-up moves the cap from 2,880 at startup to 6,048 at target. The controller never exceeds the configured per-concert limits. A lower cap slows new admits while existing sessions drain.

- Store the current rate, peak queue length, and last processed health interval by concert in Redis so replicas agree. Use one bounded decision per 15-second interval across workers. The grant script checks the live head, presence, active sessions, and both token budgets together. Publish the existing admission hint only after the grant. The REST status response continues to recover an unexpired grant if the hint is lost.
- Use completed 15-second windows for health. Record successful or normally processed reserve and checkout requests against the 500 ms threshold and count technical errors separately. More than 5% slower than 500 ms on either path or a technical failure rate of at least 1% reduces the applicable rate by half, rounded down to at least one. An explicit dependency-unavailable signal can reduce immediately even with sparse samples. Exclude business outcomes such as insufficient stock, rejected input and the per-account rate limiter from the failure count. Count shared overload responses and technical payment submission failures against the shared path.
- Use at least 20 qualifying requests across reserve and checkout as evidence for an event-level healthy window. Two consecutive healthy windows with a backlog add five buyers per second up to target. Sparse or missing telemetry keeps the rate at its current value and clears the healthy streak. Guard against an apparently healthy request path while asynchronous payment dispatch backs up. Sample the oldest due, unexpired payment intent still awaiting its first dispatch once per shared interval. Treat a backlog older than 15 seconds or an unavailable payment dependency as a shared overload signal. A completed dispatch or an order awaiting customer action is not pending dispatch work.
- Derive the shared grant speed from shared HTTP budgets and expected requests per admitted buyer. Use `floor(min(0.8 * purchaseRequestsPerSecond / 3, 0.8 * paymentRequestsPerSecond / 2))`. With the example budgets of 250 and 170 request/s this yields 66 new sessions/s across ready concerts, before health reductions. Keep this shared rate limiter and the existing per-request protections. Do not apply the old fixed 32-session limit in adaptive mode. Give ready concerts turns in bounded batches, reusing unused grants without allocating idle slots. A concurrent concert with ten entrants consumes at most ten active places for those entrants.

### Browser status and notifications

- Ticketing includes the optional `pollAfterMs` on adaptive `WAITING` and `WAITING_ROOM` responses. Use the last confirmed position to select a base delay of 5 seconds for positions 1–1,000, 20 seconds for positions 1,001–10,000, and 60 seconds for positions above 10,000 or an unranked waiting room. The browser applies fresh 80–120% jitter. An absent field selects the existing 12–15-second and socket behavior for compatibility with older deployments and rollback. Use HTTP as the recovery path and for presence renewal with or without a socket. Retry transient errors and continue aborting stale requests when leaving or switching concerts.
- Start one SockJS/STOMP connection per waiting page when its confirmed position enters the first 1,000. Ticketing checks the authenticated account and current rank when it accepts a new private subscription. If the account was just admitted, send its existing status without registering a waiting subscription. Disconnect on admission, leave, or navigation. Preserve the private admission notification and recover a missed notification via HTTP.

## Risks and verification

- The suggested HTTP budgets are inputs for the capacity model. Ticketing's existing [payment dispatcher](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/infrastructure/integration/payment/PaymentIntentDispatcher.java) claims only two intents per invocation. A queue can accumulate at that step even if the HTTP endpoints accept the requests. Backlog must therefore reduce admission. Higher sustained purchase throughput depends on available dispatch and provider capacity.
- Redis contention and worker races can produce invalid rank or duplicate sessions unless the opening transition, resume, leave and grant are tested with overlapping operations. Reuse state and token expiry formats so a redeploy keeps existing memberships and grants.
- Verify the numbers with controlled clocks, synthetic health and modest local Redis and browser fixtures. Keep a high-demand run as separate operational evidence. A passing functional test does not certify 75,000 live waiters or a specific sales rate.

## Rollout

Enable adaptive mode with one Ticketing deployment setting. Keep the current mode as the default for local deployments and rollback. The adaptive profile supplies the 250 and 170 request/s inputs explicitly. Deploy backend compatibility before the updated browser, then switch every Ticketing worker together so only one admission policy writes grants. Finish openings in progress before a mode switch. A rollback restores the fixed policy without clearing Redis or revoking already granted sessions.
