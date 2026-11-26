## ADDED Requirements

### Requirement: Cases from buyer requests

A refund case SHALL record whether it originated from an operator, an approved buyer request or a postponement choice, and link the request. The existing approval, hold and evidence rules SHALL apply unchanged.

#### Scenario: Case from an approved request

- **WHEN** an organizer approves a buyer request
- **THEN** Payment opens a case with origin `BUYER` and the request id, and dual platform approval is still required

### Requirement: Restock on confirmed refund

A confirmed refund for a performance that is on sale, not disrupted and before sale end SHALL return the refunded inventory and quota usage, exactly once.

#### Scenario: Replayed refund result

- **WHEN** Ticketing receives the same confirmed refund result twice
- **THEN** stock is released once
