# Design

## Context

Identity issues a JWT with the account's global role. The privileged filters in the receiving services consume that claim. Catalog's concert and poster use cases check `createdBy`, and Ticketing and Check-in query their local Catalog projections for the same value. The staff concert list and dataset use cases in Check-in currently read by status or concert ID. The scanner matches a complete QR string locally and persists the dataset in SQLite. See [AuthService](../../../services/identity/src/main/java/org/ticketbox/identity/auth/application/AuthService.java), [ConcertService](../../../services/catalog/src/main/java/org/ticketbox/catalog/concert/application/ConcertService.java), [CheckinService](../../../services/checkin/src/main/java/org/ticketbox/checkin/admission/application/CheckinService.java) and [scanner manual check-in](../../../mobile-scanner/src/features/checkin/manualCheckin.ts).

Catalog already sends versioned concert snapshots with independent acknowledgments. Check-in is the single admission authority, including on LAN. Its conditional write and unique admission log prevent two devices from accepting the same ticket. [Service extraction and LAN operation](../../../docs/service-extraction.md)

## Goals and scope

- Scope organizer work and Check-in to verified ownership and current grants while preserving the buyer journey, stock/hold/quota/order transactions, admission ledger, inbox/outbox behavior and released migrations.
- Keep platform approval and audit within A1. Roadmap A2–A6 own self-service publishing, new reports, refunds, gate exception workflows and operational rollout. Organization transfers and automatic onboarding are outside A1.

## Decisions for review

### Ownership and permission model

Identity owns approved organizations, membership, invitations and organization-wide grants. Catalog owns the `concert → organization` relationship and keeps the historical creator as audit data. The relationship is fixed after assignment in A1. Ticketing and Check-in consume it in their local concert projections. Cross-service links use identifiers and service contracts. [Business contexts](../../../GLOSSARY-MAP.md)

Proposed grants have distinct purposes:

| Grant | Authority |
| --- | --- |
| Organization management | Invite members and administer grants for the selected organization. Provisioning the first manager and recovering an organization with no eligible manager require a platform administrator. |
| Event management | Create concerts when granted at organization level. Manage permitted concerts, including their sale configuration, protected assets, guests and existing operational actions. |
| Finance | Read orders and view or export existing financial reports within the permitted events. |

Organization management carries delegation power within that organization. Operational or financial actions still require the corresponding explicit grant. Make grant changes visible in the audit trail. Store organization-wide grants on membership. Event assignments will be designed with the replacement scanner. In one Identity transaction, consume the invitation or update the grants and record the change. Serialize updates that could remove the last manager. An account lock takes effect even if the organization then needs platform recovery.

For pilot, a manager issues a single-use invitation bound to an existing account. The manager shares the expiring link with that person through the pilot's agreed channel. The authenticated account must match the invitation's account ID. Persist a hash of the invitation secret, its expiry and consumption state. Use the normal account sign-in and avoid introducing an invitation mail integration in A1.

Keeping owner permissions on `createdBy` would couple team access to the creator account. Owning both membership and concert ownership in Identity would require migrating a Catalog business decision out of Catalog. Keeping ownership beside its invariant allows the concert and its ownership snapshot to commit together.

### Authorization and contract compatibility

Use the bearer token to identify an account and session. For privileged requests, resolve active account and grants through a new versioned, authenticated internal Identity contract backed by the authoritative database. Use a session version for privileged access, so reactivating an account cannot restore an old privileged session. New sessions use the current token format. Keep the legacy role claim for client compatibility during transition. Update route guards to allow organization members to act in an authorized organization while keeping the buyer journey available. Privileged platform actions require a current platform grant. Keep the Identity decision endpoint behind service authentication and gateway isolation.

Each owning service resolves the resource to an event and confirms the selected organization matches the event's owner before granting access. For lists and reports, filter by organization and eligible event IDs in the data query before pagination, counting or export. Cover indirect IDs, asynchronous import and artifact access, protected media, reminders and all legacy admin or organizer aliases. Protect completed job output at read time. Public assets may continue on public paths only when the owning resource is public. A dependency failure returns a retryable service error with no protected data. A cross-organization resource is indistinguishable from an absent resource. Record privileged actions in the service that commits the effect and retain a correlation ID for review. Requests authorized before a concurrent revocation may already be in flight. The next protected request uses the updated decision.

Add organization metadata to the existing Catalog snapshot as a backward-compatible optional field during rollout. Apply it using the receiver's existing version, locking, ACK and replay rules. Require the field for a concert to enter the new privileged paths. Use the current authorized organization for new concert creation and keep purchaser flows on existing APIs. For Check-in and Ticketing, check the applied projection version and owner after new event creation. This approach reuses local ownership lookups and adds a live check where revocation matters. A JWT-only design keeps privileges until token expiry, and a new event-projected permission system would add replay, freshness and drift handling across every privileged service.

### Staff access during A1

Deny the unscoped staff routes in the Check-in service, including direct LAN requests. Scope organizer guest imports, results and summaries to the event's organization. Mobile and web staff operation, offline data, shift assignments and gate procedures are deferred with the replacement scanner.

## Rollout

1. Use additive Flyway migrations and update the receivers before emitting the ownership field. Existing events without an owner stay outside organizer access. Use two new organizations and new events for staging checks.
2. Deploy Identity, Catalog, Ticketing, Check-in and the web client together with the privileged paths closed until the new guards are active. Verify ownership snapshots, privileged access across gateway and direct routes, and buyer regression.
3. If rollout fails, close privileged routes and fix forward with the additive schema. Keep event and transaction data for reconciliation before resuming.
