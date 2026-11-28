# Performance ticket authoring

## ADDED Requirements

### Requirement: Ticket types and stock pools in plain terms

The Seating & tickets step SHALL present sale offers as ticket types and inventory groups as stock pools (seat pools for numbered seats), list each pool with the ticket types that sell from it, and explain with inline help that ticket types in one pool share its places. API and stored names SHALL NOT change.

#### Scenario: Organizer adds a first ticket type

- **WHEN** an organizer with `EVENTS` adds a ticket type with a name, a capacity and a price to a draft performance
- **THEN** the ticket type is created with its own new stock pool of that capacity
- **AND** the panel shows the pool with its capacity and the ticket type under it, without the words "inventory group" or "offer".

#### Scenario: Organizer adds an early bird that shares places

- **WHEN** the organizer chooses Add an early bird on a ticket type
- **THEN** a second ticket type is created in the same stock pool with the early-bird sale-window preset
- **AND** the inline help states that both ticket types together cannot sell more than the pool's capacity.

#### Scenario: Pool is fixed after release

- **WHEN** the organizer edits a ticket type of a released performance
- **THEN** its stock pool is shown read-only with the reason that stock pools are fixed once sales open
- **AND** a request that changes an existing ticket type's pool is refused and nothing changes.

#### Scenario: Viewer without event access

- **WHEN** a member without `EVENTS`, or a user of another organization, opens or saves the ticket setup
- **THEN** the request is refused and no ticket data of that performance is returned or changed.

### Requirement: Prices entered as VND amounts

Every price field in performance ticket setup and Admin ticket screens SHALL accept a whole VND amount shown with locale thousands separators, and every price shown in setup, review and summaries SHALL be formatted as VND.

#### Scenario: Organizer types a price

- **WHEN** the organizer types "1500000" or pastes "1.500.000 ₫" into a ticket type price
- **THEN** the field shows the amount with separators and the ₫ unit, and saves 1500000.

#### Scenario: Price is missing or out of range

- **WHEN** the price is empty, zero or above 999,999,999,999
- **THEN** the field shows an inline message next to it and the setup cannot be saved until it is corrected.

### Requirement: Sale-window presets per ticket type

Each ticket type SHALL offer sale-window presets (Whole sale period, Early bird, Final days, Starts later, Custom) computed in the venue timezone and kept inside the performance sale window, with a readable summary of the resulting window.

#### Scenario: Organizer picks Early bird

- **WHEN** the organizer chooses Early bird ending on a date for a performance whose sales open on 1 December at 10:00 venue time
- **THEN** the ticket type is on sale from 1 December 10:00 to 23:59 venue time on the chosen date
- **AND** the card shows that window with the venue timezone name.

#### Scenario: Preset does not fit the sale window

- **WHEN** a preset would start after the performance sale end or end before its start
- **THEN** the preset is not applied, the previous window is kept and an inline message explains the conflict.

#### Scenario: Reopen a saved window

- **WHEN** the organizer reopens a ticket type whose stored window matches a preset rule
- **THEN** that preset is selected; otherwise Custom is selected with the stored times.

### Requirement: Ticket type description and minimum quantity

Organizers SHALL be able to give a ticket type an optional plain-text description of up to 500 characters and a minimum quantity per order between 1 and the performance's per-account limit. Catalog SHALL publish both in the performance sale snapshot as optional fields, and receivers SHALL treat a missing minimum as 1.

#### Scenario: Organizer adds perks and a pair minimum

- **WHEN** the organizer saves a ticket type with the description "Includes a poster and fast-lane entry" and a minimum of 2
- **THEN** the sale configuration stores both, and the next published snapshot carries the description and `minPerOrder` 2 for that ticket type.

#### Scenario: Minimum exceeds the limit or capacity

- **WHEN** the minimum is above the performance's per-account limit or above the capacity of the ticket type's general-admission pool
- **THEN** saving is refused with a message on the minimum field and the stored configuration is unchanged.

#### Scenario: Edit details after release

- **WHEN** the organizer changes the description or minimum of a ticket type of a released performance
- **THEN** the change is saved as a sale revision with a new sale version and published to Ticketing
- **AND** a stale version is refused with a conflict and the organizer is asked to reload.

#### Scenario: Older snapshot without the fields

- **WHEN** Ticketing applies a snapshot whose ticket types have no description or minimum
- **THEN** it stores no description and a minimum of 1, and buyers can buy single tickets as before.
