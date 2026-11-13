# Tasks

## 1. Deployment isolation and initialization

- [ ] 1.1 Add staging Compose configuration and a preflight. Verify rejection of incomplete or development settings, allowed public routes and absent external service ports. Verify default, lab and staging Compose configurations with isolated fixtures. Document ingress, secret-store injection, provider and relay setup.
- [ ] 1.2 Add the one-time fresh pilot initialization and administrator procedure. Test Flyway validation on existing data, the known demo fixture graph on fresh volumes, initialization replay with real-data fixtures, and rejection of unrecognized databases. Verify smoke tests and the affected independent service builds.

## 2. Monitoring and recovery

- [ ] 2.1 Extend the owner metrics and internal scrape configuration. Rehearse each alert with synthetic failures, verify that the alert reaches its assigned owner, and record the recovery steps and effective thresholds.
- [ ] 2.2 Document encrypted off-host storage and extend the existing restore rehearsal with recorded recovery times and explicit payment, refund, ticket, admission and delivery invariants. Restrict CI artifact uploads to safe reports and test exclusion of dumps and deployment overrides.

## 3. Load and staging acceptance

- [ ] 3.1 Run strict OpenSpec validation, the shared `scripts/ci/verify.ps1`, Chromium buyer and support suites, `scripts/e2e/run.ps1 -Build -Restore` and an isolated load rehearsal with contention and expired holds. Record traffic, latency, errors and stock and quota results against approved limits.
- [ ] 3.2 With the staging owner, record HTTPS, storage, IAM and network boundaries, real email, support destinations and a two-organization journey. Execute and reconcile the approved VNPAY sandbox cases, including late money and console refund. Rehearse external backup restore, record RTO/RPO and attach sign-off and deferred scanner scope to the roadmap.
