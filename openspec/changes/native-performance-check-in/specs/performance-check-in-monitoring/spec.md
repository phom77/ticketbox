# Performance check-in monitoring

## ADDED Requirements

### Requirement: Live check-in view per performance

The native performance workspace SHALL show members with `EVENTS` a live check-in view for a released performance that Check-in has acknowledged: admitted and valid tickets, online and offline admissions, admissions per gate, guests checked in of total, recent admissions and the time of the last update.

#### Scenario: Doors are open

- **WHEN** an organizer with `EVENTS` opens a released performance while staff are admitting tickets
- **THEN** the panel shows admitted of valid tickets with a progress bar, online and offline counts, counts per gate, guests checked in of total and the 10 newest admissions, and refreshes about every 15 seconds while the page is visible

#### Scenario: Recent admissions do not expose credentials

- **WHEN** the organizer views or requests recent admissions
- **THEN** each row shows time, gate, ticket reference, ticket type and staff name when known, and the response contains no QR value or device id

#### Scenario: Refresh fails

- **WHEN** a refresh fails after figures were shown
- **THEN** the last figures stay visible, are marked as not current with their update time, and a retry action is offered

#### Scenario: Before release or before Check-in acknowledgement

- **WHEN** the performance is a draft or Check-in has not acknowledged its publication
- **THEN** the panel is absent and the workspace shows the existing publication sync state

#### Scenario: Page hidden

- **WHEN** the browser tab is hidden or the organizer leaves the workspace
- **THEN** automatic refresh stops and resumes with an immediate refresh when the page is visible again

### Requirement: Check-in monitoring authorization

Check-in SHALL return check-in figures and recent admissions only to a member with `EVENTS` in the organization that owns the performance.

#### Scenario: Member without EVENTS

- **WHEN** a member with only `FINANCE` or `MEMBERS` opens the performance or calls the endpoints
- **THEN** the panel is absent and the API refuses the request without figures

#### Scenario: Another organization's performance

- **WHEN** a member of organization A requests the summary or recent admissions of B's performance by id
- **THEN** Check-in responds as not found and reveals no figures

#### Scenario: Grant removed while the panel is open

- **WHEN** the member's `EVENTS` grant is removed
- **THEN** the next refresh is refused, the panel stops refreshing and shows the access message
