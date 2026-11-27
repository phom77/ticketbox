# Buyer purchase flow delta

## ADDED Requirements

### Requirement: Ticket type details in ticket selection

Ticket selection SHALL show each ticket type's description and minimum quantity when the organizer set them, and SHALL guide the buyer to meet the minimum before holding.

#### Scenario: Buyer reads perks and the minimum

- **WHEN** a buyer opens ticket selection for a performance with a ticket type that has a description and a minimum of 2
- **THEN** the ticket type shows its description and "Minimum 2 per order", and its quantity control moves from 0 to 2 and from 2 back to 0.

#### Scenario: Fewer places left than the minimum

- **WHEN** fewer places remain in the ticket type's pool than its minimum
- **THEN** the ticket type is shown as unavailable with the reason, and other ticket types stay selectable.

#### Scenario: Seated ticket type with a minimum

- **WHEN** a buyer selects seats of a seated ticket type with a minimum of 2 and has chosen only one
- **THEN** the selection says to choose at least 2 seats for that ticket type and does not send the hold until the minimum is met or the seat is removed.

#### Scenario: Server refuses the minimum

- **WHEN** the server refuses a hold because a ticket type is below its minimum (for example after the organizer raised it)
- **THEN** the buyer keeps the previous confirmed selection and sees the new minimum with a prompt to adjust the quantity.
