# Development and testing

## Run locally

Install Docker Desktop with Compose v2. From the repository root:

```sh
docker compose up -d --build
node scripts/smoke.mjs
```

Open http://localhost:18091. Images build directly from source; host Java, Maven and prebuilt JARs are not required. The web image contains the built React application. Named volumes persist databases, Redis, RabbitMQ and Core artifacts.

Copy `.env.example` to `.env` only when overriding demo defaults. If changing the public address/port, also update `APP_PUBLIC_URL`, `APP_ALLOWED_ORIGINS` and the provider return URLs. `docker compose logs -f core payment notification` shows application logs; `docker compose down` stops the deployment and retains volumes.

The SMTP sink accepts email locally without forwarding it. Its private HTTP endpoint `http://smtp:8080/stats` reports accepted message/PDF counts. MoMo/VNPAY require merchant credentials and publicly reachable signed callbacks; local MOCK checkout requires neither.

```sh
docker compose up -d --scale payment=2
docker compose --profile monitoring up -d
```

Optional monitoring exposes Prometheus at http://localhost:9090 and Grafana at http://localhost:3000. Grafana's local login is `admin` / `ticketbox-local` unless `GRAFANA_PASSWORD` is set. Prometheus scrapes Core by default; Payment and Notification metrics have separate authentication requirements.

## Web and scanner

Node.js 24 is used by Docker and CI. The web development server can call the running gateway:

```sh
cd frontend
npm ci
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:18091` in `frontend/.env.local` before starting Vite. For direct cross-origin development, add `http://localhost:5173` to the Core `APP_ALLOWED_ORIGINS` setting and recreate Core. Production web assets use the gateway's same origin.

See [the scanner guide](../mobile-scanner/README.md) for Expo, physical-device addressing and offline behavior.

## Verification

The shared CI script runs all three Java test suites, frontend lint/build and scanner typecheck. Docker must be available for Testcontainers. PowerShell 7 is required for the scripts.

```sh
pwsh -File scripts/ci/verify.ps1
```

By default Maven/Java 21 run in Docker, with `host.docker.internal` mapped to the Docker host for Testcontainers. With Java 21 installed locally, use `-BackendMode Local`. Reports are written to ignored `.artifacts/verification/` and each application's `target/surefire-reports/`.

Individual checks:

```sh
cd backend
bash ./mvnw verify
bash ./mvnw -f ../services/payment/pom.xml verify
bash ./mvnw -f ../services/notification/pom.xml verify
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

Add new Flyway migrations to the owning application's migration directory. Keep existing migrations intact: their checksums are part of already initialized databases. Core, Payment and Notification have separate histories and ownership. Generated reports, credentials, database dumps and local datasets must stay out of Git.
