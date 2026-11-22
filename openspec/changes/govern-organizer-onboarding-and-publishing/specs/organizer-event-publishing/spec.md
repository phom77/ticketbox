# Organizer event publishing delta

## MODIFIED Requirements

### Requirement: Publication readiness and recovery

Catalog SHALL check technical readiness on the server and report actionable issues. A governed event SHALL appear to buyers only when the approved release is due and Ticketing has acknowledged the matching activation version. Check-in synchronization SHALL remain independently visible.

#### Scenario: Event or tier is incomplete

- **WHEN** an event submitted for review or due for release has missing event details, an invalid sale window, no active tier or an invalid active tier
- **THEN** the event cannot advance to initial publication, and its workspace identifies the failed checks.

#### Scenario: Sale activation is committed and then acknowledged

- **WHEN** the matching version is ready and Ticketing acknowledges its activation
- **THEN** the event becomes publicly discoverable at or after its approved release time and the sale remains subject to its configured window.

#### Scenario: A receiver cannot acknowledge

- **WHEN** Ticketing is unavailable, an acknowledgment is lost or a release attempt is repeated
- **THEN** the event stays private until the matching readiness is confirmed and a workspace shows the delay rather than a successful release.
- **AND** recovery within the eligible sale window completes automatically without duplicate activation or stock changes. Delayed Check-in stays visible as a separate state.

## ADDED Requirements

### Requirement: Event review

Each event SHALL require a platform decision on its specific proposed version and schedule before its first public release. Organizer and TicketBox-assisted events SHALL follow the same review workflow.

#### Scenario: Submit a first or subsequent event

- **WHEN** an organizer with event management permission or an authorized TicketBox operator submits a ready draft
- **THEN** the draft enters the review queue with its owner, proposed public release time and sale window, and remains private while under review.

#### Scenario: Platform decides on a submission

- **WHEN** a platform reviewer approves, requests changes or rejects the current submission
- **THEN** TicketBox records the reviewer, decision, version and timestamp, and displays the reason for a change request or rejection to the organizer.
- **AND** approval schedules only that version. Requests for changes and rejections leave it private and permit a corrected submission.

#### Scenario: Submitter or stale reviewer calls a publication endpoint

- **WHEN** a caller attempts to bypass review, use a decision for another version, or act without platform review authorization
- **THEN** no unapproved version enters public release or becomes eligible for buyer transactions.

### Requirement: Scheduled public release and sale

Every initial publication SHALL have an explicit release time earlier than or equal to the sale start time. The release time SHALL require an explicit selection, and the system SHALL display the time zone for both fields. Approval SHALL schedule the release and SHALL require a release time still in the future.

#### Scenario: Release time is omitted

- **WHEN** an organizer sets a sale start and attempts to submit without entering a public release time
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

### Requirement: Reviewed revisions and publication holds

Changes to reviewed public content, dates or ticket terms SHALL require an updated approval. An authorized platform operator SHALL be able to hold a scheduled release or hide and pause a published sale with a recorded reason.

#### Scenario: Organizer changes an event or its schedule

- **WHEN** the organizer changes the proposed name, description, poster, venue, dates, release time, sale window, or customer-facing tier terms
- **THEN** the change requires fresh review before it takes effect.
- **AND** a scheduled first release cannot publish unapproved material. After publication the previously approved version can remain visible while a permissible revision is reviewed, subject to any publication hold or disruption.

#### Scenario: Platform intervenes before or after release

- **WHEN** a platform operator places a publication hold or pauses an active sale
- **THEN** the affected version cannot become public or continue accepting new sales, and the operator's reason appears in the audit trail.
- **AND** existing paid orders and issued tickets follow the established support and disruption policies. A publication hold requires an explicit reviewed schedule to resume.
