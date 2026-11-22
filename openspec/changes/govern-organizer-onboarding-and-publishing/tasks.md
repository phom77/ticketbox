# Tasks

## 1. Organizer identity and partner intake

- [x] 1.1 Add Identity's private application and review flow, pending manager provisioning and expiring account activation. Verify private entry, concurrent approval, buyer email conflicts, token expiry and reuse, and durable delivery retries. Update the Email and HTTPS deployment instructions for onboarding.
- [x] 1.2 Add scoped work-email invitations for one recipient or a bounded batch, per-recipient outcomes, resend and organization detail. Verify partial failure, duplicate retries, mismatched identities, cross-organization denial, active manager protection and recovery with a dedicated account.
- [x] 1.3 Enforce Organizer account purpose and membership on protected routes and services and scope Admin's accounts API to TicketBox staff. Verify buyer sessions, revoked grants, locked accounts, direct API calls, prior all-account routes and server-side filtering before pagination.
- [ ] 1.4 Exercise the migration of existing organizer-role accounts and legacy buyer-role memberships on a staging copy. Verify the approved account mapping, continued administrator recovery, preserved buyer histories and independent builds for Identity and Notification.

## 2. Review, scheduled release and sale readiness

- [x] 2.1 Add submitted revisions and review decisions to Catalog. Test versioned approval, change requests, rejection, stale or unauthorized decisions, assisted ownership, late approval, required explicitly entered release time, deadline validation and attempts to bypass review through admin or organizer routes. Update the publish and review API documentation.
- [x] 2.2 Update the existing sale configuration contract and Ticketing projection with the release boundary. Test compatibility with existing snapshots, blocked direct waiting-room and purchase entry before release, the interval between release and sale, and Ticketing acknowledgment recovery.
- [x] 2.3 Implement Catalog's time-aware visibility and due-release reconciliation. Test before, at and after the boundary with a controlled clock, warm caches and replica routing. Verify pending acknowledgments, restart, retries and multi-instance execution, without duplicated stock effects. Document delayed and missed release recovery.
- [x] 2.4 Stage reviewed revisions and add platform hold and pause controls. Test editing and rescheduling after approval, concurrent review and edit, hiding a public event, blocked new sales and preserved paid-order handling. Exercise existing disruption and Check-in contracts.

## 3. Web workspaces and layout

- [x] 3.1 Implement private application, activation, Admin intake and Organizer team invitation screens. Update buyer menus and redirects and exercise buyer denial, successful activation, email retry and batched membership in the Chromium organization workspace tests.
- [x] 3.2 Build the Admin review queue, publication monitoring and assisted event flow. Add the Organizer submission, revision, schedule and status views. Verify reviewer decisions, reasons, schedule time zone, readiness delay and hold states, and confirm both workspaces identify the correct owner.
- [x] 3.3 Reorganize Admin and Organizer navigation around operational responsibilities. Move ticket types and guests into event context, scope accounts and retain buyer lookup in order support. Test direct links, authorization boundaries and the existing order support flow.
- [x] 3.4 Update the shared operations shell, page headers, filter bars, table regions, Home width, dropdown styling and type readability. Remove redundant copy and verify the Coming soon group uses only public events with sales that have not started. Verify ticket types, review, organizations, orders and accounts on desktop, tablet, mobile and at zoom, including keyboard focus and both languages. Run `npm --prefix frontend run lint` and `npm --prefix frontend run build`.

## 4. Integrated acceptance

- [x] 4.1 Run Maven `clean verify`, including Identity, Notification, Catalog, Ticketing and Check-in, and run `python3 scripts/ci/verify-service-boundaries.py --service <service>` for the affected services. Run the shared CI checks through `scripts/ci/verify.ps1` or directly where PowerShell is unavailable.
- [x] 4.2 Run isolated split-stack operations acceptance using `scripts/e2e/split.py --operations` and the affected Chromium journeys. Verify a private application through scheduled announcement and opening, an existing event and paid order after migration, no unapproved direct sale, an overdue blocked release and a platform hold.
- [ ] 4.3 Verify the additive migration and rollout order against a staging copy with the current producer and consumer versions. Rehearse pause and resume without enabling direct publication for governed events. Record outcomes before accepting the rollout.

## Local verification

- The six-service Maven reactor and Catalog hold/resume integration pass. PowerShell was unavailable in the local environment. The reactor, independent Docker builds and ownership checks, report validation, CI unit tests, Compose validation, frontend lint/build and scanner type check were run directly.
- The isolated Compose journey and Chromium workspace and buyer journeys pass. The seeded event and paid order remain readable after the additive migrations. Organizer activation delivery recovered after an SMTP outage, and an issued ticket stayed accessible during a publication hold and reopening.
- Staging verification still needs a representative copy of existing organization membership, event and order data, and the staged producer and consumer versions.

## Workflow follow-up

- Consolidate the completed `organizer-identity-and-access` and `organizer-event-publishing` deltas before applying this change's modified requirements to the main specs.
