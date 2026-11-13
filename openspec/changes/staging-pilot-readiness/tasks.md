# Tasks

## 1. Local isolation

- [x] 1.1 Extend the E2E runner with loopback-bound local acceptance, explicit MOCK and SMTP fixtures, and gateway boundary checks. Verify default and lab Compose configurations and run the two-organization journey.

## 2. Operations and recovery

- [x] 2.1 Add a local operations check with owner-side counts. Rehearse an actionable condition and verify its resolution. Document the signals and how to repeat the check.
- [x] 2.2 Record the quiesced checkpoint and elapsed restore time, and verify order, payment, ticket, admission, notification and replay evidence. Restrict CI artifact uploads to named safe reports and verify the paths.

## 3. Load and acceptance

- [x] 3.1 Exercise checkout at bounded concurrency, the last available tickets, per-account quota and hold expiry. Record request counts, observed latency and stock results.
- [x] 3.2 Run OpenSpec strict validation, shared repo checks, Chromium buyer and support suites and the local gateway/restore rehearsal. Record the results and later rollout scope in the roadmap.
