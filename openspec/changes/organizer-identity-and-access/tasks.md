# Tasks

## 1. Ownership and Identity

- [x] 1.1 Record the ownership and authorization decisions in an ADR and glossary. Reconcile the operation matrix with the existing gateway, organizer and admin routes.
- [x] 1.2 Add Identity's organization, membership, invitation and audit storage. Implement platform approval, member invitation and grant changes. Verify two independent organizations, concurrent invitation reuse, cross-organization denial and manager recovery.
- [x] 1.3 Add the authenticated versioned Identity authorization endpoint, session version and client contract. Verify current grants, service authentication, account lock and reactivation with an older session.

## 2. Catalog, Ticketing and Check-in

- [x] 2.1 Store the organization on new Catalog events and publish it in the existing versioned snapshot. Check receiver replay, ownership and committed acknowledgments with an organization-owned event.
- [x] 2.2 Apply current authorization to Catalog concert, ticket type and AI entry points, including legacy admin aliases. Verify direct IDs and filtered list totals across two organizations.
- [x] 2.3 Scope Ticketing orders, tickets and reports and Check-in guest, import and summary operations to the event's organization. Verify authorization and unchanged buyer and admission persistence invariants. Block legacy staff endpoints in Check-in and verify direct and gateway denial.

## 3. Organizer web and verification

- [x] 3.1 Add organization approval, invitation acceptance, member permissions and organization selection to the web. Test a shared account switching organizations and route and action access for different grants. Run frontend lint and build.
- [x] 3.2 Verify the change with strict OpenSpec validation, Maven verification and independent builds for Identity, Catalog, Ticketing and Check-in. Run the shared CI checks and the distributed staging scenarios for two organizations, checkout and scoped reporting. Record any environment limits.
