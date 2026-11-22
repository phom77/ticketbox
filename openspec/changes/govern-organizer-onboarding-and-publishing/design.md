# Design

## Context

Identity currently approves organizations against a supplied account ID and stores grants on membership. The buyer menu links to an Organizer route whose overview accepts any authenticated account. Catalog's Organizer publish action checks technical readiness and activates the sale through its existing versioned outbox. Buyer catalog reads already gate new activations on Ticketing acknowledgment and use replica-backed caches. [Organizer access design](../organizer-identity-and-access/design.md) · [Publishing design](../organizer-event-publishing/design.md)

## Goals and boundaries

- Keep the existing service ownership and sign-in system. Separate application approval, account activation, event review, public visibility and purchase eligibility.
- Use one review policy for organizer and TicketBox-assisted events. A platform operator with both privileges may prepare and approve an event through separate recorded actions. Trusted-partner exemptions are deferred.
- Keep sale admission, stock, order, Check-in and refund guarantees with their owning services. Follow the disruption workflow for changes that affect paid orders.

## Decisions

### Private onboarding and team membership

Identity issues an expiring private application link that TicketBox can give a partner. The form collects organization details, work email and basic first-event information. The application ID is the stable approval identity. Approval records the application decision, designated manager and organization together with the pending activation and a durable delivery request. Approval retries reuse the outcome. The first event information is available when preparing the initial draft and carries no event approval.

Model account purpose and current grants explicitly using the existing privileged Organizer role and Identity membership. Existing buyer email collisions go back for correction while preserving the buyer account. A dedicated existing Organizer account can accept membership in another organization via authenticated confirmation. A pending account or an activated account without current membership gives no workspace access. Enforce this in Identity and protected service entry points and use the same capability to show navigation.

Issue distinct purpose-scoped, signed, expiring tokens for application entry and account or membership activation. Store their issuance and consumption state and derive the token again for delivery from the Identity secret and link ID. Use existing recovery and Notification delivery patterns for retry, safe link issuance and trusted destinations. Consume activation and apply membership in an Identity transaction. Reissue supersedes the previous token. Limit invitations to a bounded batch and report independent recipient outcomes. The organizer can resend a pending invitation for their own organization. TicketBox staff retain the current no-active-manager recovery operation with the dedicated account policy.

### Review the proposed event version

Catalog owns the submission, decision and approved release data under the event's existing ownership and write lock. A submission stores an immutable reviewable revision covering buyer-facing content, public and sale dates and tier terms. The reviewer sees the revision that will take effect. The event author sees the decision, reasons for required changes or rejection, and the two scheduled times. A decision against a superseded revision fails, and retrying the same completed decision returns the recorded outcome.

Keep staged edits separate from live event and tier values. Before first release, editing a reviewed field supersedes the scheduled approval. After release, a revision changes the live version only through review and the existing versioned synchronization flow. Inventory, issued tickets and orders stay on their existing records. Published seat and inventory changes remain subject to their existing sale constraints. Prepare ticket terms on the private draft before first release. Route incompatible sale or date changes through the established reschedule and disruption path. Authorized platform operators select the owning organization for assisted events and their actual account is recorded in the audit.

### Schedule public release independently of the sale

Use two independently entered fields. `publishAt` starts empty and controls buyer visibility. The organizer selects an explicit time at or before the sale start. Buyer Home groups published events before their opening time under Coming soon, including events whose waiting room is available. `saleStartAt` controls buyer transactions through Ticketing. Persist them as instants and show the time zone in both workspaces. A reviewer must approve before `publishAt`, and advancing or postponing a reviewed schedule requires a new decision. A timely approval and later technical delay can recover automatically until the sale window closes. After the window closes, require a new schedule and review.

Use Catalog’s existing draft configuration snapshots to prepare Ticketing ahead of the deadline. The due-release worker requires the current draft version to be acknowledged before issuing the activation snapshot. Carry the release boundary and revision to Ticketing with an additive contract. Until release eligibility is confirmed, reserve preparation for internal synchronization and block buyer access via direct IDs, including purchase and waiting-room entry. Ticketing retains its local sale-window and order checks. A consumer seeing a missing or stale governed revision fails closed.

Catalog enforces the approved revision, effective time, matching acknowledgment and absence of a hold in public discovery, event detail and associated public reads. Use a durable reconciliation task on the existing scheduler pattern for due releases. The write path checks the effective time and an approved revision under the concert lock, invalidates the buyer cache after commit, and waits for Ticketing acknowledgment before showing the event. The release worker can run again after a restart or race without duplicating activation. Buyer-facing list, detail and public asset responses must remain private before release, including on replicas and with warm caches. Cap cache lifetime at a relevant time boundary or invalidate on release, acknowledgment and hold. Use a consistent read when replica lag would invalidate that guarantee.

Show approval, scheduled release, readiness delay and public visibility as distinguishable statuses. If the sale configuration is not ready at the scheduled time, show the reason in Admin and Organizer and retry. Check-in synchronization remains separately visible. Before release, a platform hold invalidates automatic release until explicit rescheduling and review. After release, hide the event and use the existing pause and disruption path to stop new sales while retaining paid-order access to support. [Event refunds and disruption](../order-support-and-event-refunds/design.md)

### Workspace navigation and layout

Reuse the shared operations shell and existing design tokens. The platform navigation prioritizes partner intake, review, monitoring, order support, reconciliation, operational notifications and internal accounts. Organizer prioritizes the active organization, event work, grants-based finance and team management. Use event detail for ticket types and guests. Keep buyer searches in authorized order support, and filter the internal directory and organization member views on the server before pagination. Map old event-operation URLs into their authorized event context where a clear target exists.

Remove the desktop width cap for Admin and Organizer. Use small consistent gutters and a compact title, contextual actions, an inline filter bar and full-width tables. On the ticket types screen, place event selection and status beside filter controls, condense inventory totals into one row and give the table the main area. At narrow widths, wrap actions and filters in natural focus order and keep any horizontal overflow inside the data region. On buyer Home expand the grid by adding columns at wider sizes and align the header with the discovery layout. Standardize single-choice dropdowns across web surfaces with a theme-consistent control and option list that retains native keyboard, form and mobile behavior. Use larger, higher-contrast labels and metadata, and remove decorative subtitles and repeated descriptions while keeping accessible control names, required instructions and status feedback. Review desktop, tablet, mobile, zoom and both UI languages.

## Risks and trade-offs

- Per-event review adds work for TicketBox. The review queue exposes upcoming deadlines and overdue or blocked releases so staff can act before launch.
- Warm caches, retries and delayed acknowledgments can disagree with a schedule. Enforce the boundary at owned read and purchase paths and exercise restart, clock and replica behavior.
- Existing buyer-role accounts may be legitimate members. Inventory and coordinate their migration to dedicated accounts before changing access.
- [Concert and seating redesign](../redesign-concert-and-seating/proposal.md) also touches Catalog and event workspaces. Coordinate implementation order so the publication gate applies wherever an event or performance can become public or sellable. Keep single-event behavior and existing admission rules covered during either rollout.

## Migration plan

1. Add Identity and Catalog migrations without editing released migrations. Deploy consumers that understand the additive release contract before producers start emitting governed versions, and keep existing events readable through their current effective publication rules.
2. Inventory legacy organizations, members and upcoming events. Transfer verified Organizer grants to dedicated activated accounts without changing existing buyer accounts or order history, and preserve already-public events. Unreleased drafts enter review under the new policy.
3. Enable account entry and event governance together with the corresponding UI. Retire public access to the old manager-ID onboarding, manual code and unreviewed publication routes when replacements are ready. Verify old URLs, existing orders and legacy ownership before cutover.
4. If rollout must stop, pause onboarding and scheduled releases. Retain decisions, approved versions and activation records. Preserve public events and buyer support while restoring delivery or synchronization. Keep legacy direct publication closed for governed events during recovery.
