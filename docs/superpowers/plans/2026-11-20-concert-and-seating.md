# Concert and Seating Implementation Plan

**Goal** Sell GA, zones and numbered seats for individual performances of an event.

**Architecture** Catalog owns event and layout snapshots. Ticketing accepts complete sale revisions and runs the purchase transaction. Check-in authorizes physical admission for a performance.

**Tech stack** Spring Boot, PostgreSQL 16, Flyway, Redis, React and TypeScript.

**Specs and tracking** [OpenSpec](../../../openspec/changes/redesign-concert-and-seating/tasks.md) · [Accepted design](../../../openspec/changes/redesign-concert-and-seating/design.md)

## Global constraints

Use the current service boundaries and preserve released migration checksums. Keep event identity, order identity, public URLs and QR history for v1. Preserve canonical primary writes, service authentication, publication replay and provider confirmation. Use focused test–implementation–verification cycles. The coordinator reviews the combined diff and makes ordered commits.

## Work ownership and interfaces

| Commit area | Owner | Interface and verification |
| --- | --- | --- |
| Decisions and contracts | Coordinator | `docs/adr/0003-event-performance-and-inventory.md`, owner glossaries, v2 JSON schemas, gateway routes. Validate examples and backward compatibility. |
| Catalog performances and layouts | Catalog agent | `services/catalog` performance capability. Public event detail and map section reads, organizer CRUD and publication, internal sale snapshot. Verify with real PostgreSQL and scoped requests. |
| Ticketing stock and settlement | Ticketing agent | `services/ticketing` version receiver, one-writer mode, holds, order creation and issuance. Verify contested GA and seats, version/recovery and payment callback behavior. |
| Scoped admission | Admission agent | Check-in and Identity authorization and performance projection, ticket snapshot scope, QR scan/sync and shared results. Verify cross-organization, revocation and duplicate scans. |
| Buyer and organizer web | Coordinator | `frontend/src/api/performances.ts` and new performance screens, extending existing routes and components. Browser fixtures exercise two performances, section-only requests, stale results and keyboard/list fallback. |
| Combined deployment and rehearsal | Coordinator | Gateway journey, Compose and full repo gates. Keep operational acceptance tied to measured and available environments. |

## Review focus

- Malformed input, stale layout and authorization must fail before writes. Check the receiver and each public or organizer mutation.
- A version retry after partial communication must load one complete configuration and leave existing stock alone.
- A hold across two inventory groups fails as one unit on conflict. A late callback leaves stock subsequently acquired by another buyer intact.
- Changing organization, performance or section must discard prior requests, and map failure leaves the accessible selection list usable.
- Review deployment and restore with pending orders and receipts. Report any merchant, device or load evidence still pending separately.
