# Operations workspaces delta

## MODIFIED Requirements

### Requirement: Consistent organizer concert creation

Organizers SHALL create and manage every event through the native event workspace. Legacy concerts SHALL remain visible to organizers as read-only records.

#### Scenario: Organizer starts or resumes concert preparation

- **WHEN** an organizer with `EVENTS` chooses Create concert from the dashboard or the Concert sidebar
- **THEN** both open the guided flow (details, dates and venue, tickets and map, review) in the selected organization
- **AND** after saving and reopening a draft, the organizer sees what was saved and the next step.

#### Scenario: Organizer opens an existing legacy concert

- **WHEN** an organizer opens a legacy concert from the directory or a saved `/organizer/concerts` URL
- **THEN** the native workspace shows a read-only summary with schedule, venue, ticket types, publication state, guests, orders and reports
- **AND** the organizer cannot change its details, ticket types or bio, and sees how to ask TicketBox support for a change.

#### Scenario: Organizer calls a legacy write endpoint

- **WHEN** an organizer creates a legacy concert or changes a legacy concert, its ticket types, poster, category or bio through the API
- **THEN** the request is refused with a read-only message and nothing changes, while platform operators keep their existing legacy tools.

#### Scenario: Admin assists an organization with a concert

- **WHEN** an Admin with the assisted-creation permission creates an event
- **THEN** the Admin can choose the owning organization explicitly and sees the owner after saving
- **AND** the existing actor, review and release records still apply.

## ADDED Requirements

### Requirement: Organizer event directory

The organizer event directory SHALL let organizers find events by name and lifecycle status and show each event's current state at a glance.

#### Scenario: Filter by status

- **WHEN** the organizer filters by Draft, In review, Changes requested, Scheduled, On sale, Sold out, Past or Cancelled
- **THEN** the list shows every event of the organization with at least one performance in that status, and the total count matches the filter.

#### Scenario: Read an event row

- **WHEN** the directory lists an event
- **THEN** the row shows the poster, title, the most urgent performance status, the next date, the number of performances, a badge when a content change is in review, and actions to open, preview and view its report.

### Requirement: Delete draft events and performances

Organizers with `EVENTS` SHALL be able to delete a draft performance, or an event whose performances are all drafts, when nothing about it is under review, scheduled or released. A draft whose last review was held, rejected or returned for changes was never released and has nothing active, so it can be deleted.

#### Scenario: Delete a draft performance

- **WHEN** the organizer confirms deletion of a draft performance that was never released and whose last review, if any, was held, rejected or returned for changes
- **THEN** the performance and its draft map and tickets are removed, the event remains, map backgrounds only that performance used are removed, and backgrounds or templates still used elsewhere are kept.

#### Scenario: Deletion is not allowed

- **WHEN** the performance or any performance of the event is in review, scheduled, released, legacy-linked, or the caller's version is stale
- **THEN** nothing is deleted and the organizer sees why and what to do instead.
