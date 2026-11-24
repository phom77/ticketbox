# concert-admission Specification

## Purpose
Give buyers a consistent place in line and let each concert admit people at a rate the purchase path can sustain.

## Requirements

### Requirement: Opening draw and arrival order

Ticketing SHALL assign a randomized opening order to customers who join the waiting room before the sale. After the sale opens, each new entrant SHALL join behind those already waiting. A repeated join by the same authenticated customer SHALL keep their current waiting place or active shopping session.

#### Scenario: Customers arrive before and after opening

- **WHEN** a sale opens with customers already in its waiting room and another customer joins after opening
- **THEN** Ticketing serves the pre-opening group in its assigned order before the late entrant
- **AND** the opening transition can be retried without changing the order, duplicating entries, or transferring a customer who had already left.

#### Scenario: Browser reloads during a sale

- **WHEN** the same authenticated buyer makes a repeated `join` call with a waiting place or active shopping session
- **THEN** the buyer sees their current rank or recovers the same unexpired session token without taking another place.

### Requirement: Waiting place after disconnect or leave

Ticketing SHALL retain a waiting place for three minutes from the last successful presence renewal in adaptive mode. A confirmed explicit leave SHALL remove the place immediately. Reclaimed waiting places SHALL stop counting toward the next buyer's rank.

#### Scenario: Buyer returns before or after the deadline

- **WHEN** a disconnected buyer returns within three minutes while their place is still waiting
- **THEN** Ticketing renews its deadline and returns the rank of the same entry, calculated with the current people ahead.
- **WHEN** a fresh join follows expiration or an explicit leave after opening
- **THEN** the buyer takes a new place at the tail.

#### Scenario: Expired head and concurrent cleanup

- **WHEN** the head's waiting deadline passes or a buyer deliberately leaves while promotion is running
- **THEN** the applicable Redis operation determines one order of effects, expired or removed entries are skipped, and a stale cleanup cannot evict a renewed waiting place or a replacement session.

### Requirement: Adaptive shopping-session admission

Ticketing SHALL calculate a per-concert rate and active-session cap from the approved admission policy and enforce shared purchase and payment headroom. It SHALL admit the head only when both a session slot and rate budget are available. A reduction SHALL affect new grants while active sessions retain their existing expiry.

#### Scenario: Healthy opening wave with 75,000 people waiting

- **WHEN** an opening wave has 75,000 live entrants, the sizing assumption is 120 seconds per session, and the dependencies have capacity
- **THEN** the admission policy starts at 20 grants per second and 2,880 active sessions, and moves toward 42 grants per second and 6,048 active sessions when health permits
- **AND** a concurrent concert with ten waiting customers uses only the places and grants it consumes.

#### Scenario: Shared headroom is tight

- **WHEN** several concerts have eligible waiting buyers and together reach the shared request budget
- **THEN** the admission loop gives each ready concert a chance to use the next available grants and unused grants are available to another ready concert.

#### Scenario: Purchase latency or technical failures increase

- **WHEN** the purchase path crosses its technical latency or error threshold or a payment backlog accumulates
- **THEN** Ticketing reduces new grants at the affected concert or shared dependency boundary
- **AND** buyer decisions, ordinary stock conflicts, and duplicate checkout recovery keep their existing behavior.

#### Scenario: Workers race to grant the same place

- **WHEN** two workers attempt to admit the same customer or spend the same remaining budget
- **THEN** Ticketing grants at most one session and records the grant and budget consumption together. Leaving, expiration, or successful checkout releases the slot under the existing session rules.

### Requirement: Position-based refresh and private realtime updates

The adaptive waiting room SHALL vary HTTP status cadence by the last confirmed position. Only a buyer in the first 1,000 queued positions SHALL keep a private queue subscription. The authenticated status endpoint SHALL remain usable for rank, presence renewal, and discovery of a missed admission.

#### Scenario: Buyer approaches the front

- **WHEN** a status response moves the buyer from a distant position into the first 1,000
- **THEN** the next reconciliation uses the near-front schedule and the browser opens one private subscription for that concert
- **AND** an authenticated caller outside that group cannot keep a private subscription by calling the subscription endpoint directly.

#### Scenario: Admission arrives before the socket or its notification is lost

- **WHEN** the buyer has a live session but the socket connection or the private notification is missed
- **THEN** HTTP status returns the existing token and expiry and the browser continues to the right concert's seat selection.

#### Scenario: Buyer changes concert or explicitly leaves

- **WHEN** the buyer leaves, is admitted, or navigates to a different concert
- **THEN** the browser closes the old subscription and stops its timer and stale responses from changing the new concert's state.

#### Scenario: Browser connects to a server using the original policy

- **WHEN** the waiting status response omits the adaptive refresh hint
- **THEN** the browser uses the original refresh and notification behavior so its status requests still renew the server's shorter waiting deadline.
