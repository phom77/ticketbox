# Staff web check-in

## ADDED Requirements

### Requirement: Assigned performances and access states

The web staff app SHALL show a `STAFF` account only the performances it is actively assigned to in the selected organization, and SHALL explain each state in which it cannot check tickets in, with a next action.

#### Scenario: Staff opens the app with assignments

- **WHEN** a `STAFF` account with `ADMISSION` in an organization and two active assignments opens `/staff`
- **THEN** the app lists those two performances with venue, start time in the venue timezone and status, and each opens check-in, guests and history for that performance

#### Scenario: Staff in two organizations

- **WHEN** the account has `ADMISSION` in organizations A and B and selects B
- **THEN** only B's assigned performances are listed and every request carries organization B

#### Scenario: No admission organization or no assignment

- **WHEN** the account has no organization with `ADMISSION`, or has one but no active assignment
- **THEN** the app explains that an organizer must invite the account with the Admission permission, or assign it to a performance in the event workspace, and offers no scan control

#### Scenario: Assignment revoked during a shift

- **WHEN** an organizer revokes the assignment while the staff member has the performance open
- **THEN** the next request is denied, the app stops scanning, clears the performance and states that access to it was removed, and no admission is recorded

#### Scenario: Another role or a direct URL

- **WHEN** an account without the `STAFF` role opens `/staff`, or a staff member opens `/staff/check-in?performance=<id>` for a performance they are not assigned to
- **THEN** the role-forbidden page or the not-assigned state is shown and no performance data is returned

### Requirement: Online admission with confirmed outcomes

The web staff app SHALL submit codes from manual entry, a live camera where the browser supports it, or an image, one at a time, to Check-in for the selected performance and gate. It SHALL show "Allowed in" only after Check-in confirms the scan and SHALL NOT record or queue scans when Check-in cannot be reached.

#### Scenario: Confirmed admission

- **WHEN** staff submit a valid code for the selected performance and Check-in returns `SUCCESS`
- **THEN** the app shows "Allowed in" with the ticket reference and ticket type when available, and the admission appears in history with the gate and a web device id

#### Scenario: Rejected code

- **WHEN** Check-in returns `FAILED` because the ticket is already used, cancelled, for another performance or unknown
- **THEN** the app shows "Not accepted" with Check-in's message in the selected language, using text and an icon as well as colour

#### Scenario: Check-in unreachable

- **WHEN** the request fails because of a network error or timeout
- **THEN** the app shows "Not recorded", keeps the entered code, offers retry and points to the scanner app, and no pending scan is stored

#### Scenario: Repeated reads while a request runs

- **WHEN** the camera reads the same code several times, or staff press submit repeatedly, while a scan request is in progress
- **THEN** one scan request is sent for that code

#### Scenario: Camera unavailable

- **WHEN** camera permission is denied, no camera exists or the browser cannot decode QR codes
- **THEN** the app explains why, and manual entry and the image fallback remain usable

#### Scenario: Two devices admit the same ticket

- **WHEN** the web app and a scanner submit the same valid ticket for the same performance at the same time
- **THEN** exactly one receives "Allowed in" and the other receives "Not accepted"

### Requirement: Guest check-in and admission history

The web staff app SHALL let assigned staff find and check in guests of the selected performance and read its admission history, without showing QR values.

#### Scenario: Check in a guest

- **WHEN** staff search the guest list by name or phone and choose *Check in* for an unchecked guest
- **THEN** Check-in records the guest with the current gate and time, and the row shows them

#### Scenario: Guest already checked in

- **WHEN** staff open a guest who is already checked in
- **THEN** the app shows when and at which gate, and *Check in* is not offered

#### Scenario: Read history

- **WHEN** staff open history for the performance
- **THEN** admissions are listed newest first, 20 per page, with time, gate, ticket reference, ticket type and online or offline, and no QR value

#### Scenario: History or guests fail to load

- **WHEN** the request fails
- **THEN** the app shows an error with retry and keeps the selected performance, and an empty list is shown only when Check-in returns no rows

### Requirement: Staff app language and layout

The web staff app SHALL use the en and vi catalogs for all text and formats, and SHALL be usable by keyboard and screen reader at 1440, 834 and 390 px widths.

#### Scenario: Switch language

- **WHEN** staff switch between English and Tiếng Việt
- **THEN** labels, outcomes and dates update without losing the selected performance, gate or entered code

#### Scenario: Small screen and screen reader

- **WHEN** staff use the app at 390 px with a screen reader
- **THEN** controls have names, outcomes are announced without moving focus from the code field, and the main actions fit without horizontal scrolling
