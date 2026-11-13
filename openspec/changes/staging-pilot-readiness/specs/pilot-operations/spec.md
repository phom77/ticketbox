# Pilot operations

## Purpose

Defines the observable isolation, recovery and evidence needed to operate the TicketBox pilot safely.

## ADDED Requirements

### Requirement: Isolated pilot deployment

The staging deployment SHALL use an HTTPS gateway, environment-specific storage and secrets, VNPAY sandbox configuration, and an approved email relay. A fresh pilot database SHALL be verified free of usable demo identities and demo sales before opening public traffic.

#### Scenario: Incomplete staging settings
- **WHEN** the deployment preflight finds missing or development settings for required staging dependencies
- **THEN** it identifies the setting without disclosing the value and prevents staging exposure

#### Scenario: Fresh pilot database
- **WHEN** the operator provisions a fresh pilot database and validates initialization
- **THEN** only the operator-created administrator and approved pilot fixtures can sign in or appear in public sales data
- **AND** repeating initialization preserves actual pilot data

#### Scenario: External caller attempts internal access
- **WHEN** a caller reaches the staging ingress without an internal network route
- **THEN** the caller can access only the intended public and authorized management endpoints and cannot reach database, broker, metrics or split-service endpoints

### Requirement: Actionable operational signals

The deployment SHALL report the age or count of verified money without issuance, pending outboxes, unresolved reconciliation and refund cases, failed email and lagging admission projections. Alerts SHALL name the condition and reach an assigned operator with a documented response.

#### Scenario: Delivery dependency is unavailable
- **WHEN** a controlled outage raises an approved threshold
- **THEN** the alert identifies the owning service and remains actionable until recovery is observed
- **AND** the alert excludes credentials, personal data and ticket payloads

### Requirement: Measured recovery

TicketBox SHALL support encrypted backups stored outside the deployment host and an isolated restore of all owning databases. The restore record SHALL include observed RTO and RPO, checks for payment and ticket consistency, and replay evidence for existing email, refund and admission effects.

#### Scenario: Restored outboxes are replayed
- **WHEN** the operator restores a recorded recovery point and retries already applied deliveries
- **THEN** the verified collection, refund, order, ticket and admission state match the recovery point
- **AND** replay does not issue duplicate tickets, apply a second refund or resend acknowledged email

### Requirement: Staging acceptance evidence

The release owner SHALL record the release candidate, approved thresholds and actual results for purchase load, a two-organization journey, VNPAY sandbox settlement and refund, reconciliation, SMTP delivery and recovery. Scanner work SHALL retain the approved deferred scope.

#### Scenario: Merchant evidence is absent
- **WHEN** local fixtures pass and the approved merchant sandbox is unavailable
- **THEN** the acceptance record identifies payment and refund as pending staging evidence

#### Scenario: Two organizations share the deployment
- **WHEN** both organizations sell tickets in the staging rehearsal
- **THEN** users see only resources in their authorized scope, revoked access fails with the same token, and each verified transaction and refund reconciles to the correct organization

#### Scenario: Purchase demand competes for the last tickets
- **WHEN** the rehearsal submits purchases at the approved pilot load
- **THEN** it records observed latency and error rate and verifies that accepted orders preserve stock and quota invariants
