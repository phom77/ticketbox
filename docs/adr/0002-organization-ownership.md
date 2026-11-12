# ADR 0002. Organization ownership and authorization

**Status** Accepted for A1 on 2026-11-11.

Identity owns approved organizations, membership and organization-wide grants. Catalog owns the organization of a concert and keeps its creator as a separate account ID. The organization assignment is set on creation. The Catalog snapshot distributes it to Ticketing and Check-in under the existing version and acknowledgment rules.

The owning service resolves resource ownership. It verifies the caller's current session and grants through Identity before serving organizer data or applying a change. The selected organization ID is request context. Organization managers can delegate within their organization. They need explicit event or finance grants for those operations. Platform administrators use the separate platform routes and current platform authorization. Authorization lookup failures block privileged requests and leave public checkout independent of the lookup.

A1 starts with new organizations and events. Existing events without organization ownership stay outside organizer access. Existing Flyway migrations and IDs are retained. Unscoped staff routes are disabled while the replacement scanner is deferred. The scanner change will define scoped staff permissions and offline behavior.

[OpenSpec design](../../openspec/changes/organizer-identity-and-access/design.md) · [Identity organization access contract](../../contracts/identity.organization-access.v1.json) · [Catalog snapshot contract](../../contracts/catalog.sale-snapshot.v1.json)
