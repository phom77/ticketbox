# TicketBox project instructions

## Java service architecture

These conventions apply to Java code in `services/`. Task 6b of
`docs/superpowers/plans/2026-11-05-service-source-ownership.md` records the
service architecture migration and its verification.

- Organize a service by business capability, with `domain`, `application`,
  `infrastructure` and `web` inside each capability. A small service with one
  capability can use those layers directly under its namespace. Put Spring
  composition, security wiring and scheduler registration in `config`.
- Keep the application entry point at the namespace root. Place business classes
  in their owning capability and layer.
- Keep `domain` independent of Spring, JPA, Jackson, transport DTOs and concrete
  adapters. It owns business concepts, valid state transitions and invariants.
- Put use cases and their required I/O ports in `application`. Use cases depend
  on domain types and ports. Keep HTTP request/response types, SQL, Redis commands,
  Spring Data repositories and provider SDKs in adapters. Spring service and
  transaction annotations may remain on use-case orchestration classes.
- Put persistence mappings, persistence-only entities, repository implementations, JDBC, Redis, messaging,
  provider clients and local read projections in `infrastructure`. Translate
  their data into the types defined by the application or domain. Domain aggregates
  may use external ORM mappings as recorded in `docs/adr/0001-service-domain-models.md`.
- Put HTTP controllers, transport DTOs and HTTP error mapping in `web`. Map
  business errors to HTTP at this boundary.
- Each service owns its types and storage. Communicate across services through
  existing contracts. Within a service, use the exposed interfaces of another
  capability instead of importing its persistence or transport implementation.
- Add ports where a use case needs external I/O. Reuse suitable existing ports.
  Keep abstractions tied to an actual caller or adapter.

## Domain modeling

Read `GLOSSARY-MAP.md` and the owning service glossary before changing business terms.

- Identify the business operation, invariant, owner and transaction boundary
  before changing a write model. Derive aggregates from the consistency rules.
- Distinguish domain entities, persistence entities, value objects and read
  projections in names and responsibility. A database table does not determine
  an aggregate boundary. Several tables can persist one aggregate, and a read
  projection can use JDBC directly.
- For behavior-rich concepts, expose operations that enforce the invariant.
  Use cases coordinate those operations and adapters. Keep simple lookups small.
- Preserve the existing stock/hold/quota/order transaction, event ordering,
  idempotency, row locks and outbox/inbox guarantees while reorganizing code.
  Record a separate design decision before changing those guarantees.

## Refactoring and verification

- Follow Task 6b before the final operational acceptance in Task 7. For each
  service, map the current classes to their destination and update callers,
  tests, Spring scanning and CI suite requirements in the same change.
- Add architecture checks for layer dependencies as each service is migrated.
  Verify business behavior through the service's existing entry points.
- Preserve HTTP and message contracts, security, Redis keys and released Flyway
  migrations. Verify physical replica routing when moving aspects or config.
- Retain the exact legacy event class names and listener IDs listed in
  `scripts/ci/verify-service-boundaries.py`. Their pending-publication fixtures
  must pass after package changes.
- Run the affected service's Maven verification and independent build gate.
  Complete the root reactor and shared CI checks before accepting the full
  architecture refactor.
- Report source/build isolation, internal architecture checks and operational
  acceptance separately, with the evidence that actually ran.

Core legacy lives in `backend/`. Its deployment and verification are manual
and documented in [the legacy runbook](legacy/core/README.md). Apply service
architecture changes to the owning service.
