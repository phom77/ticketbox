# Performance ticket inventory delta

## ADDED Requirements

### Requirement: Minimum quantity per ticket type

Ticketing SHALL refuse a hold update in which a ticket type has a positive quantity, or number of seats, below that ticket type's minimum per order. The check SHALL run before any stock change, SHALL leave the previous hold unchanged when it fails, and SHALL NOT change stock, locking, quota or order rules.

#### Scenario: Buyer holds fewer than the minimum

- **WHEN** a buyer in an active purchase session requests 1 ticket of a ticket type with a minimum of 2
- **THEN** the request is refused with the ticket type and its minimum, no stock changes and the previous hold stays as it was.

#### Scenario: Buyer removes the ticket type

- **WHEN** a buyer holding 2 tickets of that ticket type sets its quantity to 0
- **THEN** the hold update succeeds and the places return to the pool as for any release.

#### Scenario: Minimum is raised while a hold exists

- **WHEN** the organizer raises a ticket type's minimum after a buyer already holds fewer than the new minimum
- **THEN** the existing hold and its order creation continue unchanged until the buyer changes the hold or it expires
- **AND** a later change to that ticket type's quantity must meet the new minimum.

#### Scenario: Replay of a refused request

- **WHEN** the buyer resends the same refused request with the same request key
- **THEN** the same refusal is returned and nothing changes.
