# Organizer event publishing delta

## MODIFIED Requirements

### Requirement: Scheduled public release and sale

Every initial publication SHALL have an explicit release time earlier than or equal to the sale start time, or the organizer SHALL choose to release as soon as a reviewer approves. The release time SHALL require an explicit selection, and the system SHALL display the time zone for both fields. Approval of a scheduled release SHALL schedule the release and SHALL require a release time still in the future. Approval of a release-on-approval submission SHALL record the approval time as the release time and SHALL require that the sale has not started and has not ended; a submission whose sale start has already passed SHALL be refused.

#### Scenario: Release time is omitted

- **WHEN** an organizer sets a sale start and attempts to submit without entering a public release time and without choosing release as soon as approved
- **THEN** the public release time remains empty, and the draft cannot enter review until a valid time is supplied.

#### Scenario: Review is complete before the release time

- **WHEN** the event is approved and ready before its scheduled release
- **THEN** the workspace shows it as scheduled, and buyer discovery, direct public event URLs and buyer transaction entry points do not expose the event before that time.
- **AND** at the scheduled time the event becomes public automatically when the release conditions hold, without another admin action.

#### Scenario: Public release precedes the sale

- **WHEN** the event has released but the sale start time is still in the future
- **THEN** buyers can find the event in Coming soon and see its opening time, and established pre-sale waiting-room rules apply. Purchase remains unavailable before the sale start.

#### Scenario: Approval or recovery misses a schedule boundary

- **WHEN** a reviewer tries to approve an already-past release time or release remains blocked until the sale window is closed
- **THEN** the event stays private and requires a new valid schedule and approval before it can be released.
- **AND** a readiness delay after timely approval can recover automatically while the approved sale window remains eligible.

#### Scenario: Organizer chooses release as soon as approved

- **WHEN** an organizer submits with release as soon as approved and a reviewer approves before the sale start
- **THEN** the approval time becomes the release time and the event becomes public without a further release step.
- **AND** a reviewer's approval after the sale start or end is refused, and a submission is refused outright when the sale start has already passed.

### Requirement: Postponement and cancellation handoff

The organizer publishing workflow SHALL route postponement or cancellation that requires operational support to the approved TicketBox workflow. Organizer actions affecting paid orders SHALL require the A4 support and refund policy before they can be enabled. For a released native performance the organizer SHALL send the handoff as an in-workspace cancellation or postponement request that platform operations accept through the existing disruption workflow or decline.

#### Scenario: Organizer asks to cancel an event with sales

- **WHEN** an organizer attempts to cancel an event with paid orders before the A4 workflow is available
- **THEN** TicketBox directs the organizer to platform operations and commits no cancellation from that organizer action.

#### Scenario: Organizer requests cancellation of a native performance

- **WHEN** an organizer requests cancellation of a released native performance from the workspace
- **THEN** a request reaches platform operations with the reason, no cancellation is committed until an operator confirms it, and the organizer sees the request state.
