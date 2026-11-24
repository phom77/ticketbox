# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The imported `AGENTS.md` holds the binding project rules (product UX feedback, OpenSpec workflow, Java service layering, domain modeling and refactoring constraints). This file adds commands and orientation.

## Commands

Run from the repository root unless noted. Java integration tests use Testcontainers, so Docker must be running. The services require Java 21 (the Maven enforcer fails the build on other JDKs). If the host JDK is not 21, replace `./mvnw` with `scripts/mvnw-docker.sh` and keep the same arguments.

```sh
# Full local stack (gateway on http://localhost:18091), then smoke check
docker compose up -d --build
node scripts/smoke.mjs
docker compose up -d --build ticketing      # rebuild/recreate one service

# Java (Java 21, Maven wrapper)
./mvnw -B -ntp clean verify                                   # six-service reactor
./mvnw -B -ntp -f services/ticketing/pom.xml clean verify     # one service
./mvnw -B -ntp -f services/ticketing/pom.xml test -Dtest=ArchitectureTest   # one test class
scripts/mvnw-docker.sh -B -ntp -f services/ticketing/pom.xml verify         # one service, in a Java 21 container
python3 scripts/ci/verify-service-boundaries.py --service ticketing         # independent build/boundary gate

# Web (Node 24)
npm --prefix frontend ci
npm --prefix frontend run dev        # set VITE_API_BASE_URL=http://localhost:18091 in frontend/.env.local
npm --prefix frontend run lint       # eslint + prettier --check + i18n catalog check (scripts/check-translations.mjs)
npm --prefix frontend run format     # apply Prettier
npm --prefix frontend test           # Vitest unit/component tests (jsdom, English catalogs)
npm --prefix frontend test -- src/features/discovery/filters.test.ts   # one file; add -t "name" for one test
npm --prefix frontend run build      # tsc -b (app + tests) + vite build

# Scanner
npm --prefix mobile-scanner ci && npm --prefix mobile-scanner run typecheck

# Shared CI (reactor, image ownership, web, scanner, compose validation); needs PowerShell 7 + Python 3
pwsh -File scripts/ci/verify.ps1                     # add -BackendMode Local to use a host JDK instead of Docker
pwsh -File scripts/e2e/run.ps1 -Build                # isolated distributed E2E (project ticketbox-e2e, port 18092)

# OpenSpec
openspec validate <change-id> --type change --strict
```

Browser fixtures in `scripts/e2e/*.mjs` use Playwright (`npm ci --prefix scripts/e2e && npx --prefix scripts/e2e playwright install chromium`). Buyer fixtures run against a Vite dev server on a specific port with mocked APIs (e.g. port 5185 for `buyer-*.mjs`, 5184 for `web-language.mjs`); workspace/performance fixtures run against an isolated Compose project. `docs/development.md` lists the exact setup for each fixture: check it before running one.

Demo accounts (local only): `audience@`, `organizer@`, `staff@`, `admin@ticketbox.com`, all with password `password123`.

## Architecture

- **Six independent Spring Boot services** in `services/` (identity, catalog, ticketing, checkin, payment, notification). Each has its own `pom.xml`, Dockerfile, PostgreSQL database, Flyway history (`src/main/resources/db/migration`) and `GLOSSARY.md`. The root `pom.xml` is only a reactor aggregating them. Base packages differ: most use `org.ticketbox.<service>`, while payment and notification use `com.ticketbox.payments` / `com.ticketbox.notifications`.
- **Ownership:** Identity owns accounts/organizations; Catalog owns concert/performance metadata and AI biography jobs; Ticketing owns stock, holds, quotas, event-sourced Orders, payment workflow and ticket issuance (plus the Redis-backed waiting-room queue); Check-in owns admission decisions, offline sync and guest lists; Payment owns provider adapters (MOCK/MoMo/VNPAY); Notification consumes RabbitMQ commands and sends email.
- **Cross-service communication** uses versioned JSON schemas in `contracts/` with outbox/inbox and ACK messages (Catalog → Ticketing/Check-in snapshots, Ticketing → Check-in tickets, Ticketing ↔ Payment intents/results). Never share code or tables across services. Legacy event class names and listener IDs are pinned by `scripts/ci/verify-service-boundaries.py`.
- **Per-service layering** is enforced by `src/test/java/.../architecture/ArchitectureTest.java` in each service. Update it when moving packages. `scripts/ci/java-suites.json` lists the test suites CI requires per service.
- **Gateway:** Nginx config in `infra/` routes `/api/...` to the services; the web app is served from the same origin.
- **Frontend** (`frontend/src`): React 18 + TypeScript + Vite + Tailwind 4. API clients live in `src/api/`, routes in `src/app/App.tsx`, pages in `src/pages/{public,...}`, feature logic in `src/features/`, design tokens in `src/app/app.css` (see `frontend/DESIGN_SYSTEM.md`). All user-facing text goes through i18next catalogs in `src/i18n/{en,vi}/`. Lint fails on missing keys or mismatched interpolation/plurals. Unit tests are colocated `*.test.ts(x)` files run by Vitest; the setup in `src/test/setup.ts` loads the English catalogs.
- **`backend/` and `legacy/core/`** are the retired Core monolith. Don't put new work there. Apply changes to the owning service.
- **Design records:** ADRs in `docs/adr/`, durable specs in `openspec/specs/`, in-flight changes in `openspec/changes/`, older plans in `docs/superpowers/`. `docs/architecture.md` and `docs/api.md` describe consistency guarantees and HTTP APIs.

## Gotchas

- Testcontainers' Docker API version (1.44, required by Docker 29) comes from each service's `src/test/resources/docker-java.properties`. Keep that file when adding a service.
- Never edit a released Flyway migration: checksums are baked into existing databases. Add a new one in the owning service.
- Initial publication of new performances is gated by `TICKETBOX_PERFORMANCE_SALES_ORGANIZATIONS` on Catalog (`*` for isolated local fixtures).
- Organizer application links and password reset need `PASSWORD_RESET_KEY` (≥32 bytes) in `.env` for Identity.
- E2E output goes to `.artifacts/`. Dumps, reports and credentials stay out of Git.
