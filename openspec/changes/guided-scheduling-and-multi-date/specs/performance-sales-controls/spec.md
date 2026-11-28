# Performance sales controls

## ADDED Requirements

### Requirement: Organizer pause and resume of sales

An organizer with the event management grant SHALL be able to pause sales of a released native performance owned by the selected organization with a recorded reason, and resume a pause the organization started. Pause and resume SHALL use the existing versioned sale publication and sales suspension, so stock, hold, quota and order guarantees are unchanged.

#### Scenario: Pause an on-sale performance

- **WHEN** an organizer pauses an on-sale performance with a reason
- **THEN** Catalog publishes a new sale version marked suspended, the workspace shows *Pausing…* until Ticketing acknowledges it and then *Sales paused*, and from then on buyers cannot start new holds and see sales as paused.
- **AND** existing holds, awaiting-payment orders, paid orders and issued tickets follow the existing suspension rules.

#### Scenario: Resume an organizer pause

- **WHEN** the organizer resumes the open pause while the sale window is still open and no disruption is active
- **THEN** Catalog publishes a new sale version that is not suspended and buyers can buy again once Ticketing acknowledges it.

#### Scenario: Pause refused once doors open

- **WHEN** an organizer pauses sales at or after the performance's doors-open time (`doors_open_at`, or `starts_at` when doors is not set)
- **THEN** the pause is refused with a message that sales controls close when doors open and to contact TicketBox, and no version is published.

#### Scenario: Open pause resumed at doors open

- **GIVEN** an organizer pause is still open when doors open
- **WHEN** the doors-open time is reached
- **THEN** Catalog resumes sales automatically through the normal publication path, records the pause as resumed by the system and audits it, so Check-in admission is not blocked by the suspension. Platform disruptions are unaffected.

#### Scenario: Repeated or stale request

- **WHEN** the same pause or resume request is sent twice, or a pause is requested for a performance that is already suspended, not on sale, ended or not yet acknowledged by Ticketing
- **THEN** a repeat returns the recorded outcome and an ineligible request is refused without publishing a version.

#### Scenario: Unauthorized pause

- **WHEN** a member without the event management grant, an organizer of another organization or an anonymous caller pauses or resumes the performance, or the performance is a legacy concert
- **THEN** the request is refused and the sale is unchanged.

#### Scenario: Platform disruption during an organizer pause

- **WHEN** platform operations confirm a cancellation or postponement of a performance paused by the organizer
- **THEN** the disruption proceeds, the organizer pause is closed as superseded, and the organizer can no longer resume sales; only platform operations can end the disruption.

### Requirement: Cancellation and postponement requests

An organizer with the event management grant SHALL be able to send platform operations one open request to cancel or postpone a released native performance, with a reason and, for postponement, a proposed new schedule. Only an authorized platform operator SHALL be able to accept the request, by confirming the existing performance disruption, or decline it with a reason.

#### Scenario: Request a postponement

- **WHEN** an organizer requests postponement of an on-sale performance with a reason and a future proposed start and end
- **THEN** the request is recorded as requested, appears in the platform operations request queue, and the workspace shows it as waiting for TicketBox.

#### Scenario: Request and pause together

- **WHEN** the organizer selects *Also pause sales now* while sending the request
- **THEN** the request and the pause are committed together, or neither is.

#### Scenario: Operator accepts the request

- **WHEN** a platform operator opens the request and confirms a postponement or cancellation in the existing disruption workflow
- **THEN** the request is marked accepted and linked to the disruption in the same transaction, the organizer sees the disruption state, and buyer options follow the existing disruption rules.

#### Scenario: Operator declines or organizer withdraws

- **WHEN** an operator declines the request with a reason, or the organizer withdraws it before a decision
- **THEN** the request closes, the organizer sees the outcome and reason, and the performance and its sales are unchanged.

#### Scenario: Second or ineligible request

- **WHEN** an organizer sends a request while another request or a disruption is open, or for a performance that is a draft, cancelled, completed or a legacy concert
- **THEN** the request is refused and nothing is recorded.

#### Scenario: Unauthorized decision

- **WHEN** an organizer or a user without platform operations authorization tries to accept or decline a request
- **THEN** the call is refused and the request is unchanged.
