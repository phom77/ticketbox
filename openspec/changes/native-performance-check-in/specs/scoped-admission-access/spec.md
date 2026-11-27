# scoped-admission-access

## ADDED Requirements

### Requirement: Performance-scoped staff admission

Check-in SHALL let a `STAFF` account read and record admission for a performance only while it holds `ADMISSION` in the organization that owns the performance and an active assignment to that performance. The scanner and the web staff app SHALL use the same performance-scoped routes, and Check-in SHALL check the assignment on every request.

#### Scenario: Assigned staff scans a ticket

- **WHEN** an assigned staff member with `ADMISSION` submits a valid ticket for that performance from the scanner or the web app
- **THEN** Check-in records one admission with the staff id, device id and gate and confirms it

#### Scenario: Unassigned or revoked staff

- **WHEN** a staff member who was never assigned, or whose assignment was revoked, requests a list, dataset, tickets, history, guests, scan or sync for the performance
- **THEN** Check-in denies the request on that request, returns no protected data and records no admission

#### Scenario: Ticket of another performance

- **WHEN** an assigned staff member submits a ticket that belongs to another performance
- **THEN** Check-in rejects the scan without marking either ticket used

#### Scenario: Organization mismatch

- **WHEN** the request names an organization in which the account lacks `ADMISSION`, or a performance owned by another organization
- **THEN** Check-in denies the request without revealing whether the performance exists
