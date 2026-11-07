# Development and testing

## Run locally

Install Docker Desktop with Compose v2. From the repository root:

```sh
docker compose up -d --build
node scripts/smoke.mjs
```

Open http://localhost:18091. Docker builds the images from source with its bundled Java and Maven. The web image contains the built React application. Named volumes persist databases, Redis, RabbitMQ and application artifacts. Each Java image builds from its own directory under `services/`.

Copy `.env.example` to `.env` only when overriding demo defaults. If changing the public address/port, also update `APP_PUBLIC_URL`, `APP_ALLOWED_ORIGINS` and the provider return URLs. `docker compose logs -f identity catalog ticketing checkin payment notification` shows application logs; `docker compose down` stops the deployment and retains volumes.

The SMTP sink accepts email locally without forwarding it. Its private HTTP endpoint `http://smtp:8080/stats` reports accepted message/PDF counts. MoMo/VNPAY require merchant credentials and publicly reachable signed callbacks; local MOCK checkout requires neither.

```sh
docker compose up -d --scale payment=2
docker compose --profile monitoring up -d
```

Optional monitoring exposes Prometheus at http://localhost:9090 and Grafana at http://localhost:3000. Grafana's local login is `admin` / `ticketbox-local` unless `GRAFANA_PASSWORD` is set. In the default Compose deployment, Prometheus scrapes Ticketing. Payment and Notification metrics have separate authentication requirements.

## Web and scanner

Node.js 24 is used by Docker and CI. The web development server can call the running gateway:

```sh
cd frontend
npm ci
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:18091` in `frontend/.env.local` before starting Vite. For direct cross-origin development, add `http://localhost:5173` to `APP_ALLOWED_ORIGINS` and recreate the services receiving browser requests. Production web assets use the gateway's same origin.

See [the scanner guide](../mobile-scanner/README.md) for Expo, physical-device addressing and offline behavior.

## Verification

The shared CI script runs the six-service Maven reactor, the separate Core legacy suite, image ownership checks, frontend lint/build and scanner typecheck. It also validates the default, lab and legacy Compose configurations. Docker must be available for Testcontainers. PowerShell 7, Python 3 and Node.js 24 are required for the shared checks.

```sh
pwsh -File scripts/ci/verify.ps1
```

By default Maven/Java 21 run in Docker, with `host.docker.internal` mapped to the Docker host for Testcontainers. With Java 21 installed locally, use `-BackendMode Local`. Surefire writes XML under each application's `target/surefire-reports/`. CI records those results and JAR hashes in `.artifacts/verification/verification.json`. [Required suites by function](../scripts/ci/java-suites.json) identifies each service and the separate `coreLegacy` group.

Run these checks from the repository root.

```sh
mvn -B -ntp clean verify
mvn -B -ntp -f services/ticketing/pom.xml clean verify
mvn -B -ntp -f backend/pom.xml clean verify
python3 scripts/ci/verify-service-boundaries.py --service ticketing
```

```sh
cd frontend
npm run lint
npm run build
cd ../mobile-scanner
npm ci
npm run typecheck
```

## Distributed and browser regression

```sh
pwsh -File scripts/e2e/run.ps1 -Build
pwsh -File scripts/e2e/run.ps1 -Restore
```

These scripts use a separate `ticketbox-e2e` project on port 18092. They create fixtures, stop/restart services, simulate Redis state loss, check duplicate/late payments and verify database fencing. The optional restore rehearsal checkpoints writers and boots applications against restored databases and volumes. Test output stays in `.artifacts/e2e/`; test data and backup volumes are retained for investigation. The helper rejects project names outside its test namespace.

Checkout recovery regression uses mocked API responses to test lost responses, reloads, failed attempts and late settlement at desktop/tablet/mobile viewports:

```sh
npm ci --prefix scripts/e2e
npx --prefix scripts/e2e playwright install chromium
node scripts/e2e/checkout-recovery.mjs
```

Build the frontend first. This browser suite does not replace live purchase/provider integration tests.

## Database changes

Add new Flyway migrations to the owning application's migration directory. Keep existing migrations intact: their checksums are part of already initialized databases. The six services and Core legacy each have their own Flyway history. Generated reports, credentials, database dumps and local datasets must stay out of Git.


## Split-service verification

Python acceptance scripts under `scripts/e2e/` exercise the six-service topology. Use an isolated `E2E_PROJECT` and `E2E_PORT`, or use the PowerShell E2E entry point.

Follow the [service cutover guide](service-extraction.md) before migrating an existing Core database. Run the legacy topology with `docker compose -f compose.legacy.yaml up -d --build`. Local backup files and generated reports stay under `.artifacts/`.

Phase 5–6: see [replication and partitioning lab](lab-replication-partitioning.md) for the `compose.lab.yaml` override, acceptance commands, switchover and benchmark evidence.
