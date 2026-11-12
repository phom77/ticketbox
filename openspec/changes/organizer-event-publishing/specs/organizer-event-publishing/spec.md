# Organizer event publishing

## Purpose

Authorized organizers can prepare, preview and publish events in their own organization and continue editing when optional workspace data is unavailable.

## ADDED Requirements

### Requirement: Scoped draft and preview

Catalog SHALL allow an organizer with the event management grant to prepare and preview a draft owned by the selected organization. Organizer sessions SHALL be able to view published public pages under the same visibility rules as guests.

#### Scenario: Preview is private

- **WHEN** an organizer of A opens the draft preview of an A event
- **THEN** the organizer sees the buyer-facing content and a draft indicator, while unauthenticated users and users scoped to B receive no draft content.

#### Scenario: View a published event as an organizer

- **WHEN** an organizer visits a published public event page
- **THEN** the page is visible and purchase actions reflect the existing buyer eligibility rules.

### Requirement: Publication readiness and recovery

Catalog SHALL validate publication on the server and report actionable readiness issues. Catalog SHALL expose a newly published event to buyers after Ticketing acknowledges its sale activation version. Check-in synchronization SHALL have its own visible status.

#### Scenario: Event or tier is incomplete

- **WHEN** an authorized organizer requests publication with missing event details, an invalid sale window, no active tier or an invalid active tier
- **THEN** publication is rejected with the failed checks and the event remains a draft.

#### Scenario: Sale activation is committed and then acknowledged

- **WHEN** a valid draft is published
- **THEN** the organizer sees synchronization in progress until Ticketing acknowledges the activation, and the event then appears to buyers under its configured visibility and sale window.

#### Scenario: A receiver cannot acknowledge

- **WHEN** Ticketing is unavailable, an acknowledgment is lost or the publication request is repeated
- **THEN** the saved publication can be retried without creating a second event or changing stock twice, and the organizer can distinguish pending activation from an acknowledged sale.
- **AND** a delayed Check-in acknowledgment is visible independently, including when Ticketing has already acknowledged.

### Requirement: Scoped search and counts

Concert and guest searches SHALL apply authorization and matching filters before computing totals and pagination. Counts shown for a filtered guest list SHALL use the same filters.

#### Scenario: A match is beyond the first unfiltered page

- **WHEN** an organizer searches a large authorized list that includes a match beyond the first page
- **THEN** the match is returned, total counts match the filtered scope, and no item from another organization appears.

### Requirement: Workspace section recovery

The workspace SHALL load basic event information independently of guest, order and Check-in data. Sections available to the caller SHALL surface their own errors and retry controls. The default workspace load SHALL omit AI data.

#### Scenario: One optional request fails

- **WHEN** the order, guest or Check-in request fails while the event request succeeds
- **THEN** authorized event editing remains available, the affected section shows that its data is unavailable, and retry reloads that section.

#### Scenario: Organization changes during a request

- **WHEN** an organizer switches organization with outstanding workspace requests
- **THEN** responses from the previous organization never replace the new workspace or appear in its counts.

### Requirement: Postponement and cancellation handoff

The organizer publishing workflow SHALL route postponement or cancellation that requires operational support to the approved TicketBox workflow. Organizer actions affecting paid orders SHALL require the A4 support and refund policy before they can be enabled.

#### Scenario: Organizer asks to cancel an event with sales

- **WHEN** an organizer attempts to cancel an event with paid orders before the A4 workflow is available
- **THEN** TicketBox directs the organizer to platform operations and commits no cancellation from that organizer action.
