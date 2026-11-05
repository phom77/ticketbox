# Phase 2–4 service extraction

User authorization covers Identity and Catalog first, then Check-in, then Ticketing.

- [x] Compile the existing business modules as a shared runtime library. Each service explicitly selects its own beans, entities and repositories.
- [x] Give Identity its accounts database. Keep UUIDs and JWT claims compatible.
- [x] Give Catalog concert metadata and AI jobs. Publish full, versioned sale configurations through a durable outbox to Ticketing and Check-in. Activation requests wait for Ticketing acknowledgement. Catalog reads availability from its local projection.
- [x] Keep transactional stock and all Order event sourcing in Ticketing. Apply catalog configurations idempotently with per-concert serialization. Published ticket records use acknowledged outbox delivery, with per-ticket versions.
- [x] Give Check-in its local ticket and concert projections, admission ledger, guest lists and CSV worker. One Check-in database is the authority for a deployment, including LAN operation. Fully disconnected scans remain pending.
- [x] Route service APIs through the gateway and update Notification contact/document calls.
- [x] Provide an offline cutover script for existing data, preserve legacy deployment configuration, and verify source snapshots before changing routing.
- [x] Run the original Java suites and new service integration tests. Exercise purchase, duplicate payment, repeat/concurrent scans, CSV, AI, configuration catch-up, source outage and replay on the split Compose deployment.
