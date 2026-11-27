# Organizer event publishing delta

## MODIFIED Requirements

### Requirement: Postponement and cancellation handoff

The organizer publishing workflow SHALL route postponement or cancellation that requires operational support to the approved TicketBox workflow. Organizer actions affecting paid orders SHALL require the A4 support and refund policy before they can be enabled. For a released native performance the organizer SHALL send the handoff as an in-workspace cancellation or postponement request that platform operations accept through the existing disruption workflow or decline.

#### Scenario: Organizer asks to cancel an event with sales

- **WHEN** an organizer attempts to cancel an event with paid orders before the A4 workflow is available
- **THEN** TicketBox directs the organizer to platform operations and commits no cancellation from that organizer action.

#### Scenario: Organizer requests cancellation of a native performance

- **WHEN** an organizer requests cancellation of a released native performance from the workspace
- **THEN** a request reaches platform operations with the reason, no cancellation is committed until an operator confirms it, and the organizer sees the request state.
