# TicketBox project instructions

## Product UX feedback to preserve

- Read [the organizer and concert UX feedback](docs/product/organizer-concert-ux-feedback.md)
  before changing concert creation, ticket setup, venue maps, organizer records
  or admin workspaces. It captures direct product-owner feedback and should
  guide future agents.
- Ship production workflows that explain the task and help users complete it.
  Do not add controls solely to invoke APIs or demo states without a useful
  workflow and clear feedback.
- Concert setup must use guided, calendar-based date and time controls. Avoid
  requiring users to type raw timestamps, map coordinates or unexplained fill
  values.
- A venue image is a visual reference, not interactive inventory. Maps must
  support selecting actual zones or seats and assigning ticket types and prices,
  with assisted authoring such as templates, generated rows and seats, direct
  canvas editing and an accessible list or keyboard route.
- Admins and organizers need a clear, permission-aware route into creating and
  managing concerts. Explain access states and give an appropriate next action.
- Workspace pages should use available space beside navigation, provide readable
  type and contrast, use styled searchable controls for long option lists, and
  offer a persistent user-selectable dark theme.

## Development workflow

- Start with the [core engineering rules](docs/engineering/core.md) and select
  applicable guides from the [engineering handbook](docs/engineering/standards.md).
  For Java services, see [backend engineering](docs/engineering/backend.md).
  For web or scanner changes, see [frontend engineering](docs/engineering/frontend.md).
  Web UI work also follows [frontend/AGENTS.md](frontend/AGENTS.md).
- Use the checks in [Development and testing](docs/development.md). For review,
  apply the [engineering checklist](docs/engineering/review-checklist.md).
- For new substantial behavior or contract changes, use the
  [OpenSpec workflow](docs/development.md#planning-changes). Get the proposal,
  requirements, design and tasks reviewed before implementation. For small
  fixes and documentation updates, inspect the scope, make the change, and
  verify it with the relevant checks.
- Keep existing specifications and accepted decisions as references. Continue
  work already planned under `docs/superpowers/` in its existing artifacts.
  Get approval before changing an engineering policy or making a significant
  architecture, data ownership, security, or infrastructure decision.

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

The retired Core monolith (`backend/`) and its manual runbook (`legacy/core/`)
were removed on 2026-11-24. They remain in Git history at commit `73fcd66`.
Apply service architecture changes to the owning service.
