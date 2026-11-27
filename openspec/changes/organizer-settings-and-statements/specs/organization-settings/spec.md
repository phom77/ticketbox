# Organization settings

## ADDED Requirements

### Requirement: Organization profile and statement details

Identity SHALL keep a profile for each approved organization: logo, contact email, contact phone, website, legal name, tax code, billing address and reporting timezone. The approved display name SHALL stay under platform control. Every active member SHALL be able to read the profile in the organizer workspace.

#### Scenario: Member opens Settings

- **WHEN** an active member of the selected organization opens Settings
- **THEN** the page shows the display name read-only, the profile, the statement details and the reporting timezone
- **AND** each section the member cannot edit is read-only and names the grant needed to edit it.

#### Scenario: Organization without a saved profile

- **WHEN** a member opens Settings for an organization whose profile has never been saved
- **THEN** the fields are empty, except the contact email seeded from the organizer application, and the reporting timezone is `Asia/Ho_Chi_Minh`.

#### Scenario: Another organization's profile

- **WHEN** a caller requests the profile of an organization they are not an active member of
- **THEN** the request is answered as not found and no profile data is returned.

#### Scenario: Display name change

- **WHEN** a member wants to change the organization's display name
- **THEN** Settings shows the name read-only with a route to contact TicketBox, and the organizer API offers no way to change it.

### Requirement: Grant rules for settings changes

Members with `MEMBERS` SHALL edit the profile, logo and reporting timezone. Members with `MEMBERS` or `FINANCE` SHALL edit statement details. Changes SHALL be validated, use a version check and be audited without storing field values.

#### Scenario: Manager saves the profile

- **WHEN** a member with `MEMBERS` saves a valid contact email, phone, `https` website and timezone
- **THEN** the profile is saved, a success toast appears, and the organization audit records the actor, time and changed field names.

#### Scenario: Finance member saves statement details

- **WHEN** a member with `FINANCE` and without `MEMBERS` saves a legal name, a tax code in MST format and a billing address
- **THEN** the statement details are saved
- **AND** a request by the same member to change the profile or logo is refused and nothing changes.

#### Scenario: Member without an editing grant

- **WHEN** a member with only `EVENTS` or `ADMISSION` submits a settings change through the UI or the API
- **THEN** the change is refused, nothing is saved, and the page explains which grant is needed.

#### Scenario: Invalid values

- **WHEN** a member submits an invalid email, a non-`https` website, an unknown timezone, a malformed tax code or a value over its length limit
- **THEN** nothing is saved and each error appears next to its field.

#### Scenario: Concurrent edits

- **WHEN** two members edit the same section and the second saves with an older version
- **THEN** the second save is refused with a conflict, the section reloads with the current values, and the member is asked to review and save again.

#### Scenario: Grant removed during editing

- **WHEN** a member's editing grant is removed while Settings is open and they then save
- **THEN** the save is refused on that request and the page shows the section as read-only.

### Requirement: Organization logo

Members with `MEMBERS` SHALL upload, replace and remove the organization logo. Identity SHALL store it in its own image storage.

#### Scenario: Valid upload

- **WHEN** a member with `MEMBERS` uploads a JPEG, PNG or WebP logo up to 2 MB and at least 128×128 pixels
- **THEN** a square preview is shown, the logo is saved, and the previous logo is deleted after the change commits.

#### Scenario: Rejected or failed upload

- **WHEN** the file has another type, is too large or too small, or the image storage fails or is not configured
- **THEN** the profile keeps its previous logo, the error explains what to do, and the other profile fields can still be saved.

#### Scenario: Remove the logo

- **WHEN** a member with `MEMBERS` removes the logo
- **THEN** Settings shows the placeholder and statements issued afterwards have no logo.

### Requirement: Organization reporting timezone

Sales reports for an organization or event scope SHALL use the organization's reporting timezone. A report for a single native performance SHALL use that performance's timezone. Every report and export SHALL state the timezone it used.

#### Scenario: Organization uses another timezone

- **WHEN** a member with `MEMBERS` sets the reporting timezone to `Asia/Bangkok` and a member then opens Reports › Sales for the whole organization
- **THEN** period dates and trend buckets are computed in `Asia/Bangkok` and the report and its exports state `Asia/Bangkok`.

#### Scenario: Single performance scope

- **WHEN** the sales report is scoped to one native performance whose venue timezone differs from the organization's timezone
- **THEN** the report uses the performance's timezone and states it.

#### Scenario: Timezone unavailable from Identity

- **WHEN** the organization access response carries no reporting timezone or an invalid one
- **THEN** Ticketing uses `Asia/Ho_Chi_Minh` and states it, and authorization behaves as before.

### Requirement: Organization profile for other services

Identity SHALL expose the organization profile to TicketBox services through a versioned internal contract. Services SHALL NOT read Identity tables.

#### Scenario: Ticketing reads the profile for a statement

- **WHEN** Ticketing requests an organization profile with the service token
- **THEN** Identity returns the display name, statement details, contacts, logo URLs, reporting timezone and version as defined by `identity.organization-profile.v1`.

#### Scenario: Unknown organization or missing service token

- **WHEN** the organization does not exist or the service token is missing or invalid
- **THEN** Identity returns not found or an authentication failure respectively, and no profile data.
