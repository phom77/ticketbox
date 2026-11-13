# Pilot operations

## Purpose

Defines the evidence needed to rehearse TicketBox operations on an isolated local host.

## ADDED Requirements

### Requirement: Isolated local rehearsal

TicketBox SHALL support a named local rehearsal using fixture volumes, loopback ports, MOCK payment and the local SMTP sink.

#### Scenario: The local rehearsal is started
- **WHEN** the operator starts the local acceptance run
- **THEN** the gateway uses loopback and its internal service and management routes return 404
- **AND** the enabled payment provider is MOCK and mail uses the local sink

### Requirement: Local operational signals

The rehearsal SHALL report aggregate counts from the owner for unissued paid tickets, pending delivery, unresolved reconciliation or refund cases, failed email and pending admission projections.

#### Scenario: A controlled condition is raised and cleared
- **WHEN** a local fixture introduces an actionable failure and the operator resolves it
- **THEN** the check reports the owner and the observed status before and after recovery
- **AND** the evidence excludes credentials and customer or ticket payloads

### Requirement: Measured local recovery

The rehearsal SHALL record the quiesced recovery point, elapsed recovery time, and consistency evidence across the six owning databases.

#### Scenario: Restored outboxes are replayed
- **WHEN** the operator boots services on the copied databases and retries already applied deliveries
- **THEN** payment, refund, ticket and admission state match the checkpoint
- **AND** replay does not apply a second refund or resend acknowledged email

### Requirement: Local acceptance evidence

The roadmap SHALL record the release candidate, bounds and results of the two-organization journey, browser checks, local payment and email, recovery and purchase contention.

#### Scenario: Shoppers compete for the last tickets
- **WHEN** concurrent shoppers reserve the final tickets and a hold later expires
- **THEN** only available stock is allocated, per-account quota is enforced, and expiry releases the hold
- **AND** the report records concurrency, latency and unexpected responses
