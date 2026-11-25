# Buyer refund requests

## Purpose

Let buyers ask for a full-order refund and follow the decision, using the audited refund workflow.

## ADDED Requirements

### Requirement: Request a refund

A buyer SHALL be able to request a full-order refund with a reason for a paid order whose tickets are unused and not transferred, until 24 hours before doors. Only one open request SHALL exist per order.

#### Scenario: Eligible order

- **WHEN** a buyer requests a refund for a paid order three days before the event
- **THEN** the order shows "Waiting for the organizer" and FINANCE members of the organization see the request

#### Scenario: Ticket already used or transferred

- **WHEN** any ticket of the order was admitted or transferred
- **THEN** the request is rejected with an explanation

### Requirement: Organizer decision

Organization members with the FINANCE grant SHALL approve or reject requests for their events; rejection SHALL include a note shown to the buyer. Approval SHALL open a platform refund case in the existing workflow, and the buyer SHALL see the request move to Refunded when the refund is confirmed.

#### Scenario: Approved and refunded

- **WHEN** the organizer approves and platform admins confirm the merchant refund
- **THEN** the tickets are cancelled, the buyer is notified once and the order shows Refunded

#### Scenario: Seat returns to sale

- **WHEN** the refund is confirmed while the performance is still on sale and not disrupted
- **THEN** the refunded seats or quantity become available to other buyers
