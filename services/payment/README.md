# Payment service

Independent Java 21 / Spring Boot application with its own PostgreSQL database and Flyway history. It owns provider attempts, signed callbacks/query, durable result delivery, audit and compensation reviews. Core alone owns stock, order eligibility and ticket issuance.

Run with `docker compose up -d --build` from the repository root. Standalone verification: `bash backend/mvnw -f services/payment/pom.xml verify` (use `mvnw.cmd` on Windows).

Core persists an immutable intent before sending it to this service. Payment persists an attempt before provider I/O, keeps the same request identity after uncertain results, then stores verified success with a result outbox entry. A worker sends the result to Core; only its persisted ACCEPTED ACK completes the attempt. Late money for an expired/cancelled order creates a compensation review instead of reviving stock.

MOCK works locally. MoMo/VNPAY require merchant credentials and reachable callbacks; adapters have local protocol fixtures, not real merchant certification. Review actions can redrive queries or record externally completed refunds. They do not automatically charge or refund.

Private APIs require `PAYMENT_SERVICE_TOKEN` through `X-Service-Token`. Provider webhook routes verify signatures. The public gateway blocks internal/actuator routes. Database connections use `PAYMENT_DATABASE_URL`, `PAYMENT_DATABASE_USER` and `PAYMENT_DATABASE_PASSWORD`.

Contracts live in `contracts/`; see [architecture](../../docs/architecture.md) and [testing](../../docs/development.md). Embedded provider adapters also remain in Core; protocol fixes must cover both copies until that compatibility implementation is retired.
