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

For a separate staging deployment, set `TICKETBOX_PAYMENT_PROFILE=staging` for the shared Payment and Ticketing profiles. Use the staging secret store for `VNPAY_TMN_CODE` and `VNPAY_HASH_SECRET`. Set `VNPAY_PAY_URL` and `VNPAY_QUERY_URL` to the merchant's sandbox endpoints. Set `VNPAY_RETURN_URL` and `VNPAY_IPN_URL` to the staging HTTPS origin at `/payment/result` and `/api/payments/webhooks/vnpay`, and register the IPN with the merchant. Confirm `GET /api/payments/providers` returns only `VNPAY` as a buyer before running the checkout. The provider list is empty until the VNPAY settings pass readiness checks.

Set a separate `PASSWORD_RESET_KEY` of at least 32 bytes in Identity's secret store to enable buyer account recovery. Configure Notification with the HTTPS `APP_PUBLIC_URL` as the origin for reset emails and use the staging SMTP relay. Keep the reset key stable while encrypted deliveries are pending. Set the approved HTTPS destinations `VITE_SUPPORT_URL` and `VITE_TERMS_URL` before building the web image. An absent or invalid destination hides its link.

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

## Planning changes

Use OpenSpec for new substantial changes to user journeys, business invariants,
or HTTP, event, and data contracts. Keep small fixes and documentation updates
in the regular review workflow. Continue in-flight work under
[`docs/superpowers/`](superpowers/) using its existing plans and specs. Link
relevant accepted requirements and ADRs from new proposals.

1. Use `$openspec-explore` in Codex when the problem or constraints need discovery.
   Use `$openspec-propose` to draft the proposal, design, testable spec deltas
   and tasks under `openspec/changes/`.
2. Get the proposal, requirements, design and tasks reviewed before applying.
   Capture expected failures and compatibility risks as well as the happy path.
   Record significant architectural decisions in [`docs/adr/`](adr/).
3. After approval, use `$openspec-apply-change`. Run the checks below for the
   affected areas and review the diff against the accepted requirements.
   Run `openspec validate <change-id> --type change --strict` to check the
   change artifacts.
4. After acceptance, use `$openspec-archive-change` to archive the change and
   update the durable specifications under `openspec/specs/`. Update the
   project docs affected by the accepted change.

This repository includes the OpenSpec configuration and Codex skills. Check
your CLI with `openspec --version`. For installation options, see the
[official OpenSpec guide](https://openspec.dev/docs/installation).

## Verification

The shared CI script runs the six-service Maven reactor, image ownership checks, frontend lint/build and scanner typecheck. It also validates the default and lab Compose configurations. Docker must be available for Testcontainers. PowerShell 7, Python 3 and Node.js 24 are required for the shared checks.

```sh
pwsh -File scripts/ci/verify.ps1
```

By default Maven/Java 21 run in Docker, with `host.docker.internal` mapped to the Docker host for Testcontainers. With Java 21 installed locally, use `-BackendMode Local`. Surefire writes XML under each application's `target/surefire-reports/`. CI records those results and JAR hashes in `.artifacts/verification/verification.json`. [Required suites by function](../scripts/ci/java-suites.json) identifies the required suites for each of the six services.

Run these checks from the repository root.

```sh
./mvnw -B -ntp clean verify
./mvnw -B -ntp -f services/ticketing/pom.xml clean verify
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

These scripts use a separate `ticketbox-e2e` project on port 18092. They create two organizations, exercise checkout and scoped operations, verify that unscoped staff routes are blocked over gateway and LAN, and stop Identity to test authorization failure. Check-in persistence tests still exercise admission concurrency and offline sync. The optional restore rehearsal checkpoints writers and boots all six applications against restored databases. Test output stays in `.artifacts/e2e/`. The helper rejects project names outside its test namespace.

Include the password-reset and SMTP outage fixture by setting a local-only key for the isolated run.

```sh
PASSWORD_RESET_KEY=ticketbox-e2e-only-password-reset-key-at-least-32 pwsh -File scripts/e2e/run.ps1 -Build -Restore
```

The gateway rehearsal uses MOCK payment and simulated manual refund evidence. A staging operator verifies the actual refund on the VNPAY merchant console before recording its reference, amount and completion time in TicketBox.

Run the A6 local acceptance rehearsal from the repository root.

```sh
pwsh -File scripts/e2e/run.ps1 -LocalAcceptance -Build
```

The command uses project `ticketbox-e2e-acceptance`, loopback ports 18096 and 18097, fixture secrets, MOCK payment and the SMTP sink. It exercises two fixture organizations and restores copied databases. Results are in `.artifacts/e2e/local-acceptance/`. The report records a quiesced checkpoint and elapsed recovery time. The local load fixture measures eight shoppers competing for three tickets, one quota rejection and an accelerated hold expiry. These measurements apply to the local fixture and host.

The journey reports aggregate operations counts by owner. For a failed email, use the platform exception queue, inspect the delivery status, retry the same command once and confirm the record becomes sent. For pending settlement or reconciliation, inspect the Payment review and result backlog. For missing issuance or delayed admission projection, inspect the corresponding Ticketing and Check-in outbox and confirm it drains after recovery. The A6 report records an injected email failure and the count after retry. CI publishes the named JSON summaries. Dumps, generated overlays and raw E2E logs stay local.

While the acceptance stack is running, repeat the aggregate check from a second terminal.

```sh
E2E_PROJECT=ticketbox-e2e-acceptance E2E_PORT=18096 python3 scripts/e2e/split.py --operations
```

While the isolated stack is running, use Chromium to exercise organizer approval, invitations, organization selection and mobile buyer checkout through MOCK payment and QR recovery.

```sh
npm ci --prefix scripts/e2e
npx --prefix scripts/e2e playwright install chromium
node scripts/e2e/organization-workspace.mjs
```

Checkout recovery regression uses mocked API responses to test lost responses, reloads, failed attempts and late settlement at desktop/tablet/mobile viewports:

```sh
npm ci --prefix scripts/e2e
npx --prefix scripts/e2e playwright install chromium
node scripts/e2e/checkout-recovery.mjs
```

Build the frontend first. This browser suite does not replace live purchase/provider integration tests.

Run the web language checks against Vite on port 5184.

```sh
VITE_API_BASE_URL=http://localhost:5184 npm --prefix frontend run dev -- --port 5184 --strictPort
node scripts/e2e/web-language.mjs
```

Add web translations in `frontend/src/i18n/<language>/`. The supported language list lives in `frontend/src/i18n/index.ts`. Use stable message keys, translate complete phrases, and run `npm --prefix frontend run lint` to check catalog coverage, interpolation variables and plural forms.

## Database changes

Add new Flyway migrations to the owning application's migration directory. Keep existing migrations intact: their checksums are part of already initialized databases. The six services and Core legacy each have their own Flyway history. Generated reports, credentials, database dumps and local datasets must stay out of Git.


## Split-service verification

Python acceptance scripts under `scripts/e2e/` exercise the six-service topology. Use an isolated `E2E_PROJECT` and `E2E_PORT`, or use the PowerShell E2E entry point.

Core deployment, verification and cutover are documented in the [manual legacy runbook](../legacy/core/README.md).

Phase 5–6: see [replication and partitioning lab](lab-replication-partitioning.md) for the `compose.lab.yaml` override, acceptance commands, switchover and benchmark evidence.
