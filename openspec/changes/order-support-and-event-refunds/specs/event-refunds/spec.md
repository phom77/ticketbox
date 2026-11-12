# Event refunds

## Purpose

Allow TicketBox to coordinate event disruptions and record verified refunds while protecting collected funds, tickets and admission records.

## ADDED Requirements

### Requirement: Authorized full-order refund decision

Current platform admins SHALL create and approve full-order refund cases. Approval SHALL require an admin account different from the requester and a verified collection. Organizer finance SHALL have read-only access to its cases. Refund eligibility SHALL be established before the external operator sends money.

#### Scenario: Admission already accepted or unconfirmed

- **WHEN** any affected ticket was admitted or transferred, or Check-in cannot confirm a hold on all affected tickets
- **THEN** the case remains for manual review and the standard workflow cannot approve an external refund.

#### Scenario: Payment arrived too late

- **WHEN** the collection has a compensation case and no issued tickets
- **THEN** the same financial approval and confirmation rules apply without an admission hold or changes to order fulfillment.

### Requirement: External refund evidence

Payment SHALL record confirmed full-order refunds using the verified collection, provider refund reference, actual amount and time, and the current actor. Duplicate actions SHALL return the persisted result. Conflicting action identities, repeated references across cases and refunds beyond verified money SHALL be rejected.

#### Scenario: Delivery fails after external refund confirmation

- **WHEN** Payment records a valid external refund and a receiving service is unavailable
- **THEN** the evidence remains durable and delivery resumes without another external refund.
- **AND** Ticketing, Check-in, Notification and A3 converge on the same refund outcome.

### Requirement: Confirmed refund effect

An approved refund hold SHALL prevent new online admission while awaiting evidence. A confirmed refund SHALL invalidate the affected tickets, update eligible order state, publish A3 evidence and notify the buyer once. An aborted case SHALL release the hold only after an authorized confirmation that funds were not sent.

#### Scenario: A stale ticket update follows revocation

- **WHEN** Check-in receives an older ticket snapshot after holding or revoking a ticket
- **THEN** it preserves the newer hold or revocation and the existing admission record.

#### Scenario: Check-in loses a hold acknowledgment

- **WHEN** Check-in durably holds the tickets and the acknowledgment is lost
- **THEN** retrying the same case returns the durable hold, and admission remains blocked while the refund outcome is unresolved.

### Requirement: Event disruption impact and tracking

Platform admins SHALL preview affected orders before confirming a postponement or cancellation and record the reason. The workflow SHALL pause sales and online admission, track paid and in-flight orders and show pending acknowledgments. Postponement SHALL preserve eligible tickets and require an explicit resume after schedule confirmation.

#### Scenario: Cancellation races with settlement

- **WHEN** a payment settles or is verified late during cancellation
- **THEN** it is included once in the operation or compensation queue, and paid and unfulfilled orders are distinguished.

#### Scenario: An organizer attempts to cancel a paid event

- **WHEN** an organizer attempts to cancel or postpone an event through a management API
- **THEN** the request is blocked and the workspace directs the organizer to TicketBox operations.
