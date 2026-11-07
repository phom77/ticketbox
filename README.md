# TicketBox

A concert ticketing platform built with six independent Java services, a React web app, and an offline-capable Expo scanner.

The project focuses on the difficult parts of ticket sales: admission control, concurrent inventory updates, idempotent checkout, payment reconciliation, durable messaging and gate check-in.

## Features

- **Audience:** browse concerts, enter a waiting room, reserve ticket quantities, recover interrupted checkout, pay through MOCK/MoMo/VNPAY adapters and view QR e-tickets.
- **Organizer:** manage owned concerts and ticket types, import guest lists from CSV, review AI-generated artist biographies, inspect sales and export revenue reports.
- **Staff:** scan QR tickets online, download an offline dataset, sync check-in logs and handle guest-list attendance.
- **Admin:** manage accounts, concert/order/ticket operations, notification retries and payment compensation reviews.

## Quick start

Requires Docker Desktop with Compose v2. Run from the repository root:

```sh
docker compose up -d --build
```

Open **http://localhost:18091**. The first build downloads Java/Node dependencies; wait for Core startup before signing in. Check readiness at **http://localhost:18091/api/health**.

No host Java installation or prebuilt artifacts are needed. Compose includes the web gateway, six backend applications, six PostgreSQL databases, Redis, RabbitMQ and a local SMTP sink. Defaults use MOCK payment and mock artist biographies; external provider keys are optional. Copy `.env.example` to `.env` to customize addresses or integrations.

| Demo role | Email | Password |
| --- | --- | --- |
| Audience | `audience@ticketbox.com` | `password123` |
| Organizer | `organizer@ticketbox.com` | `password123` |
| Staff | `staff@ticketbox.com` | `password123` |
| Admin | `admin@ticketbox.com` | `password123` |

These are local demo accounts. SMTP accepts messages locally without delivering them externally.

```sh
node scripts/smoke.mjs                   # Web, catalog, role login and notification checks
docker compose logs -f identity catalog ticketing checkin payment notification
docker compose down                     # Stop services; retain named data volumes
```

## Architecture

~~~mermaid
flowchart LR
  Clients[React web / Expo scanner] --> Gateway[Nginx]
  Gateway --> Identity
  Gateway --> Catalog
  Gateway --> Ticketing
  Gateway --> Checkin[Check-in]
  Gateway --> Payment
  Gateway --> Notification
  Identity --> I[(Identity DB)]
  Catalog --> C[(Catalog DB)]
  Ticketing --> T[(Ticketing DB)]
  Checkin --> X[(Check-in DB)]
  Payment --> P[(Payment DB)]
  Notification --> N[(Notification DB)]
  Catalog -->|Versioned configuration / ACK| Ticketing
  Catalog -->|Versioned configuration / ACK| Checkin
  Ticketing -->|Ticket outbox / ACK| Checkin
  Ticketing <-->|Intent / result / ACK| Payment
  Ticketing --> RabbitMQ --> Notification
  Ticketing --> Redis
~~~

Identity owns accounts. Catalog owns concert metadata and AI jobs. Ticketing owns transactional stock, holds, quotas, Order event sourcing, payment workflow and ticket issuance. Check-in owns admission decisions, offline synchronization, guest lists and CSV jobs. Each application has its own PostgreSQL instance and runtime role.

Each Java service builds from its own source, tests and resources. The root Maven reactor verifies all six applications. Order events and stock changes commit together in Ticketing. Durable, versioned snapshots synchronize the Catalog and Check-in projections.

For an existing Core database, follow the offline [service cutover guide](docs/service-extraction.md) before serving traffic with the new topology. The previous deployment is available through compose.legacy.yaml. Phase 5–6 is available in the isolated [replication and partitioning lab](docs/lab-replication-partitioning.md), including stale reads, primary checkout routing, manual switchover and measured query plans.

## Stack

| Area | Technology |
| --- | --- |
| Backend | Java 21, Spring Boot 3.3, Spring Modulith, Spring Security/JWT |
| Persistence | PostgreSQL 16, JPA/JDBC, Flyway, Spring Batch |
| Messaging and resilience | RabbitMQ, Redis 7, Resilience4j, ShedLock |
| Web | React 18, TypeScript, Vite, Tailwind CSS |
| Scanner | Expo, React Native, SQLite |
| Delivery and operations | Docker Compose, Nginx, Actuator/Micrometer, optional Prometheus/Grafana |

## Repository

```text
backend/           Legacy Core application, migrations and integration tests
services/          Six independent applications, each with its own code, migrations and tests
frontend/          React web application
mobile-scanner/    Expo scanner and offline synchronization
contracts/         Versioned integration schemas
infra/             Gateway, database initialization, SMTP and monitoring config
scripts/           Verification, smoke and isolated end-to-end tests
docs/              Architecture, development and API guides
compose.yaml       Default six-service deployment
compose.lab.yaml   Optional replication and partitioning lab override
compose.legacy.yaml  Legacy Core deployment
```

## Verification and documentation

```sh
mvn -B -ntp clean verify                 # Six-service Maven reactor
pwsh -File scripts/ci/verify.ps1          # Java, image ownership, web and scanner checks
pwsh -File scripts/e2e/run.ps1 -Build     # Isolated distributed workflow and fault tests
```

Java integration tests require Docker. PowerShell 7 runs the shared verification scripts; Python 3 runs split-service acceptance and cutover checks; Node.js 24 is used for local web/scanner development and smoke checks. See [development and testing](docs/development.md) for individual commands, browser regression, restore rehearsal and optional monitoring.

- [Architecture and consistency](docs/architecture.md)
- [Development and testing](docs/development.md)
- [API guide](docs/api.md)
- [Mobile scanner](mobile-scanner/README.md)

## Scope

The default deployment is for local development and demonstration. Real merchant sandbox certification, automated provider refunds, large-scale capacity acceptance and multi-device offline field testing remain outside the verified scope. A transferred/refunded enum value is not a complete transfer/refund workflow. The project does not claim production readiness or 80,000-user capacity.
