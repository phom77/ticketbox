## ADDED Requirements

### Requirement: Transfer state on the ticket page

The ticket page SHALL show a Transfer action for eligible tickets, the pending recipient with a Cancel action while an offer is open, and "Received from" for received tickets. Order detail SHALL mark transferred tickets.

#### Scenario: Pending transfer

- **WHEN** a buyer opens a ticket with a pending offer
- **THEN** the page shows the recipient's name, the expiry time and Cancel transfer
