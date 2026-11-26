# Buyer ticket transfer

## Purpose

Let a buyer give a ticket to another TicketBox account safely, with the old QR invalidated.

## ADDED Requirements

### Requirement: Offer a transfer

A ticket holder SHALL be able to offer a `VALID`, originally purchased ticket to an existing audience account by exact email until 2 hours before doors. The system SHALL reject the offer when the ticket was itself received by transfer, when a refund request, refund case or admission hold covers the order, when the event is disrupted, or when the recipient is the sender.

#### Scenario: Valid offer

- **WHEN** a buyer offers a valid ticket to friend@example.com, which belongs to an audience account
- **THEN** a pending transfer is created, the ticket shows "Transfer pending" and the recipient is notified

#### Scenario: Unknown email

- **WHEN** no TicketBox account uses the email
- **THEN** the offer is rejected with a message that reveals nothing about other accounts

#### Scenario: Too close to the event

- **WHEN** the buyer offers a ticket less than 2 hours before doors
- **THEN** the offer is rejected and the ticket page explains the cut-off

### Requirement: Accept, decline, cancel and expire

The recipient SHALL accept or decline a pending transfer, the sender SHALL cancel it until it is accepted, and an unanswered transfer SHALL expire at the cut-off. Acceptance SHALL atomically mark the original ticket `TRANSFERRED` and issue a new ticket with a new QR code to the recipient.

#### Scenario: Recipient accepts

- **WHEN** the recipient accepts a pending transfer
- **THEN** the original ticket is `TRANSFERRED`, Check-in rejects its QR, and the recipient's wallet holds a new valid ticket for the same seat

#### Scenario: Accept and cancel race

- **WHEN** the sender cancels while the recipient accepts
- **THEN** exactly one outcome is applied and both people see the same final state

#### Scenario: Received ticket

- **WHEN** a recipient opens a ticket they received
- **THEN** the page shows who sent it and offers no Transfer action
