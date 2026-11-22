# Proposal

## Why

TicketBox needs a private path for onboarding organizers and a publication review for each event, including repeat events from an existing partner. The operations workspaces also need clearer responsibilities and more room for review queues, filters and data tables.

## What Changes

- **BREAKING** Restrict Organizer to dedicated, activated accounts with organization membership. Remove Organizer entry points from the buyer experience and replace manager-account-ID onboarding with a private partner application and work-email activation.
- Replace manual member codes with email activation and acceptance. Let organization managers invite individuals or a batch with shared grants, independently of TicketBox staff.
- **BREAKING** Replace direct event publishing with review of a specific version and a scheduled release. Approval records the decision, publication occurs automatically at a separately selected and approved time when ready, and the sale opens on its own schedule. Public events whose sale has yet to start appear in Coming soon.
- Let authorized TicketBox operators prepare events on a partner's behalf under the partner's ownership. Provide a review queue, an audited publication hold and the existing disruption workflows for events with sales.
- Separate the platform operations navigation from the organization workspace. Move buyer lookup into order support, partner accounts into their organization, and event-specific editing into event detail.
- Update both operations workspaces to use the available width below the header beside the sidebar. Let buyer Home use more of wide viewports as well. Standardize web dropdowns, improve text readability, and remove redundant copy from buyer and operations screens.

## Capabilities

### New Capabilities

- `operations-workspaces` defines Admin and Organizer navigation, event-assisted operations, account lookup boundaries and responsive workspace layout.

### Modified Capabilities

- `organizer-access` defines private partner applications, separate account activation, email-based team onboarding and Organizer entry authorization.
- `organizer-event-publishing` adds review decisions, scheduled release, revision controls and publication holds to the existing readiness flow.

## Impact

- Identity owns the application, dedicated organizer accounts and grants. Notification delivers activation and membership messages through the existing service boundary.
- Catalog owns review, public visibility and the release schedule. Ticketing retains authority over the sale window and sale configuration acknowledgments. Check-in status remains independently observable.
- The web app changes buyer navigation, protected Organizer entry, Admin operations and shared workspace layout. Existing order-support and disruption policies still govern paid orders.
- The prerequisite deltas are [Organizer access](../organizer-identity-and-access/specs/organizer-access/spec.md) and [Organizer publishing](../organizer-event-publishing/specs/organizer-event-publishing/spec.md). They are complete changes pending consolidation into the main specs. Consolidate them before applying this change's modified requirements to the main specs.
