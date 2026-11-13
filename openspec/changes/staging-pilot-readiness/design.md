# Design

## Context

The development stack includes six services, MOCK payment, an SMTP sink and demo fixtures. The distributed journey covers two organizations and the restore script checkpoints and copies the six owning databases. Prometheus currently scrapes Ticketing alone.

## Goals and scope

Run A6 entirely on the local Docker host. Use a named test project with its own volumes and loopback ports. Record local evidence for two organizations, mocked payments and refunds, email, operational alerts, restore and bounded load. Live provider and relay verification, TLS ingress, production initialization, off-host storage and device/offline admission are deferred.

## Decisions

- **Isolated run.** Extend the existing E2E runner with an explicit local acceptance option. It selects loopback bindings, fixture credentials, MOCK payment and the local SMTP sink. Verify the public gateway excludes internal and management endpoints and that browser-facing routes continue to enforce organization scope. Reuse the existing Flyway demo fixtures.
- **Operational checks.** Keep signals local. Run documented owner-side read-only checks against the isolated databases for verified collections without issuance, queued delivery, unresolved reconciliation or refunds, failed email and pending admission projections. Emit status and counts without customer data. Rehearse an active condition and recovery with fixture data. Internal observability endpoints stay on the Compose network.
- **Restore.** Reuse quiesced dumps and restore onto copied databases. Record snapshot and elapsed recovery times, compare payment, order, ticket and admission state, and replay reconciliation and refund results. Verify that acknowledged mail is not resent. Limit CI uploads to named report files and exclude logs, dumps and generated overlays from the E2E directory.
- **Load.** Use the public queue, reserve and order endpoints for a bounded local race for the final tickets, with one shopper hitting the per-account quota and one hold expiring. Record concurrency, timing, responses and inventory invariants. The fixture requires exactly the available stock to succeed, zero unexpected responses and every request to finish within the local HTTP timeout. Record observed values without treating them as a production capacity target.
