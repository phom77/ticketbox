# Proposal

## Why

TicketBox scopes organizer work to the account that created a concert, while several staff endpoints rely on the global staff role. A two-organizer staging pilot needs teams to share responsibility for their own concerts and staff to work only at assigned concerts.

## What Changes

- Let TicketBox approve organizations and designate their first manager. Let managers invite members and assign event management and finance permissions within their organization. Let users select their current organization.
- Authorize each protected action in the owning service using the caller's current account, membership, grants and the resource's concert. Apply the same scope to list counts, search, export, batch results, downloads and direct resource IDs.
- Keep the existing platform-admin operations separate from organizer operations. Audit organization approval and membership changes.
- Start with new organizations and events. Events without an organization stay outside organizer access. Disable unscoped staff routes while the scanner work is deferred.

## Capabilities

### New Capabilities

- `organizer-access`: Organization approval and membership, scoped event permissions, current authorization and organization ownership.
- `scoped-admission-access`: Deactivation of unscoped staff access until the replacement scanner and its authorization are ready.

### Modified Capabilities

## Impact

- Identity, Catalog, Ticketing and Check-in, their existing HTTP entry points and the Catalog sale snapshot contract. The web client gains organization context. Scanner development is deferred.
- Payment and Notification contracts and buyer checkout, ticket issuance and admission event semantics remain governed by the existing service contracts.
- [Roadmap A1](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md), [service ownership and LAN operation](../../../docs/service-extraction.md), [domain-model ADR](../../../docs/adr/0001-service-domain-models.md).
