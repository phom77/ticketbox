# Buyer disruption options

## Purpose

Tell buyers what changed when an event is postponed or cancelled and what they can do.

## ADDED Requirements

### Requirement: Options for a postponed event

For a postponed event, My tickets and the ticket page SHALL show a banner linking to an options page with the new date and the choices Keep my ticket and Request a refund. A refund request from this page SHALL skip the organizer decision.

#### Scenario: Buyer keeps the ticket

- **WHEN** the buyer chooses Keep my ticket
- **THEN** the ticket stays valid for the new date and the banner is dismissed

#### Scenario: Buyer requests a refund

- **WHEN** the buyer chooses Request a refund before the new date
- **THEN** a platform refund case is opened without organizer approval

### Requirement: Status for a cancelled event

For a cancelled event the options page SHALL show that a refund is being processed and its current status, without requiring action.

#### Scenario: Cancellation in progress

- **WHEN** the buyer opens the options page of a cancelled event
- **THEN** the page shows the cancellation and the refund status of each affected order
