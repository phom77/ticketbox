# Organizer scheduling

## ADDED Requirements

### Requirement: Guided date and time entry

The organizer workspace SHALL let organizers enter performance schedules, ticket-type sale windows and release times with an accessible calendar and time picker instead of raw date-time text. Every value SHALL be shown and interpreted in the performance time zone, and the field SHALL label that zone.

#### Scenario: Pick a start with the keyboard

- **WHEN** an organizer opens the start date picker and uses arrow keys, Page Up/Down and Enter to choose a day, then types or selects a time
- **THEN** the field shows the chosen date and time with the performance time zone label, and focus returns to the field when the picker closes.

#### Scenario: Smart defaults after choosing a start

- **WHEN** an organizer sets the start of a new performance and has not edited doors, end or sale end
- **THEN** doors are filled 30 minutes before the start, the end 2 hours after it and the sale end at the start, and each filled value can be changed.

#### Scenario: Wall time that does not exist in the zone

- **WHEN** an organizer chooses a time skipped or repeated by a clock change in the performance time zone
- **THEN** the field shows an inline error explaining the problem and the schedule is not saved until a valid time is chosen.

#### Scenario: New performance uses the venue time zone

- **WHEN** an organizer creates a performance at a venue with a default time zone
- **THEN** the performance uses that zone, shows it beside every date field and offers *Change time zone* through a searchable list.

### Requirement: Add several dates at once

An organizer with the event management grant SHALL be able to create several draft performances of an owned native event in one action by choosing several days and one start time, optionally copying an existing performance's setup. The action SHALL create all performances or none.

#### Scenario: Add three dates from the calendar

- **WHEN** an organizer selects three future days, a start time and a venue space and confirms
- **THEN** three draft performances are created with the chosen start, the default doors, end and sale end, and they appear in the event's performance list.

#### Scenario: One date is invalid

- **WHEN** one of the selected starts is in the past or duplicates another selected start
- **THEN** no performance is created and the dialog names the failing dates.

#### Scenario: Too many dates or another organization

- **WHEN** a request contains more than 30 dates, or targets an event of another organization, or comes from a member without the event management grant
- **THEN** it is refused and no performance is created.

### Requirement: Duplicate a performance

An organizer SHALL be able to duplicate any performance of an owned native event into a new draft at a chosen start. The copy SHALL keep the venue space, map, stock pools and ticket types, shift every time by the start offset and carry no review, publication, guests, staff or disruption.

#### Scenario: Duplicate a released performance

- **WHEN** an organizer duplicates an on-sale performance to a start one week later
- **THEN** a draft is created with the same venue space, map, stock pools, ticket types and prices, its end, doors, sale window and ticket-type windows are one week later, and the source performance and its sales are unchanged.

#### Scenario: Shifted sale start is already past

- **WHEN** the shifted sale start of the copy is earlier than now
- **THEN** the copy is still created, its sale start is empty and the readiness list shows it as missing.

#### Scenario: Duplicate refused

- **WHEN** a member without the event management grant, or an organizer of another organization, duplicates the performance, or the source is a legacy concert
- **THEN** the request is refused and nothing is created.

### Requirement: Apply pricing to other dates

An organizer SHALL be able to copy the ticket types and prices of one performance to other draft performances of the same event whose stock pools match. The copy SHALL apply to every selected target or to none.

#### Scenario: Apply pricing to two drafts

- **WHEN** an organizer applies the pricing of performance A to drafts B and C that use the same stock pools
- **THEN** B and C get A's ticket types, prices and pool assignments with sale windows shifted to their own starts, and each sale version increases.

#### Scenario: A target does not qualify

- **WHEN** one target is released, under review or scheduled, has different stock pools, or was changed since the organizer loaded it
- **THEN** no target changes and the response names the target and the reason.

### Requirement: Venue library

An organizer SHALL be able to manage the organization's venues: edit name, address, city, default time zone and capacity hint, and add or rename spaces. Buyer-visible venue names and addresses SHALL NOT change while a released or scheduled performance uses the venue.

#### Scenario: Add a space to an existing venue

- **WHEN** an organizer adds a space named "Hall B" to a venue
- **THEN** the space can be chosen for new performances and layout templates, and a duplicate space name in the same venue is refused.

#### Scenario: Edit a venue used by a released performance

- **WHEN** an organizer changes the name or address of a venue whose space is used by a released, submitted or scheduled performance
- **THEN** the change is refused with an explanation and an offer to create a new venue, while city, time zone, capacity hint and new spaces can still be saved.

#### Scenario: Capacity hint is exceeded

- **WHEN** the configured capacity of a performance map exceeds the venue capacity hint
- **THEN** the map editor shows a warning and the organizer can still save.

#### Scenario: Concurrent venue edit

- **WHEN** two members save the same venue from the same version
- **THEN** the second save receives a conflict and keeps the member's input for review.

### Requirement: Release now or at a scheduled time

When submitting a performance for review, an organizer SHALL choose either release as soon as it is approved or release at a selected time in the performance time zone. Both choices SHALL follow the existing review, version and release rules, and a release SHALL never occur after the sale start.

#### Scenario: Release as soon as approved

- **WHEN** an organizer submits with *Release as soon as approved* and a platform reviewer approves before the sale start
- **THEN** the release time is recorded as the approval time and the performance becomes public automatically without another action.

#### Scenario: Approval after the sale start

- **WHEN** a reviewer approves a *Release as soon as approved* submission after its sale start has passed
- **THEN** approval is refused with an explanation, the performance stays private and the organizer can correct the schedule and resubmit.

#### Scenario: Scheduled release

- **WHEN** an organizer submits with a release time in the performance time zone that is in the future and not after the sale start
- **THEN** the submission enters review, the workspace shows "Releases at" with the time and zone, and approval schedules that release.

#### Scenario: Changed draft after submission

- **WHEN** the schedule, map, sale or event content changes after either kind of submission
- **THEN** the pending review is superseded as today, and nothing unapproved is released.
