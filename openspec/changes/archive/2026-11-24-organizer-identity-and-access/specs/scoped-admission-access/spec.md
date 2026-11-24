# Staff access during A1

## Purpose

TicketBox keeps concert, guest and ticket information isolated while the mobile scanner and scoped staff workflows are deferred.

## ADDED Requirements

### Requirement: Unscoped staff endpoints are disabled

Check-in SHALL deny requests to legacy staff routes while scoped staff authorization is unavailable. Organizer guest imports and summaries SHALL use the event owner and current management grant.

#### Scenario: Legacy staff account requests a dataset or sends a scan

- **WHEN** an account with the global staff role requests a staff list, dataset, scan, history or sync
- **THEN** Check-in denies the request without returning protected data or recording admission, including when called directly on LAN.
