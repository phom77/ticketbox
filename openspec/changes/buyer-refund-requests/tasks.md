# Tasks

## 1. Decision

- [x] 1.1 Accept ADR 0004 (restock on confirmed refund). The restock task waits for this.

## 2. Ticketing

- [x] 2.1 Migration and `RefundRequest` domain transitions with unit tests.
- [x] 2.2 Buyer endpoints (create, withdraw, view on order) and organizer endpoints (list by organization, approve, reject) with eligibility under the order lock. Integration tests: used/transferred ticket, pending transfer, inside 24h window, disrupted event, duplicate request, organization scope. The FINANCE grant check is the shared `OrganizationAccess` interceptor (`@OrganizerPermission(FINANCE)`), not re-tested per endpoint. Also added: platform fallback endpoints under `/api/admin/refund-requests`, buyer options endpoints (`/api/tickets/disruptions`, `/api/tickets/events/{id}/options`) and the gateway route.
- [x] 2.3 Hand-off to the Payment case command with `origin`/`refundRequestId`; update request status from refund result and case abort.
- [x] 2.4 Restock on confirmed refund (after 1.1), idempotent on replay. Integration tests for reserved seat, GA, quota and closed sale.

## 3. Payment, contracts and Notification

- [x] 3.1 Additive `origin` and `refundRequestId` on case creation; show origin in the platform case view.
- [x] 3.2 Add the four refund-request event types and templates (en/vi). Update boundary checks and fixtures. Ticketing emits received, approved and rejected; `submitted` (organizer FINANCE members) is defined and templated but not emitted yet because Ticketing has no way to list an organization's FINANCE members.

## 4. Web

- [x] 4.1 Order detail: Request a refund (reason, rules), status timeline, withdraw.
- [x] 4.2 Options page and disruption banners on My tickets and ticket page.
- [x] 4.3 Organizer workspace: refund requests queue with approve/reject.
- [x] 4.4 Mocked fixtures: request → organizer approve → refunded; reject; postponed options; cancelled status. Added to `scripts/e2e/buyer-ticket-wallet.mjs`; the organizer decision is played by the fixture, and the organizer queue page is covered by screenshots and unit tests only.

## 5. Verification

- [ ] 5.1 Ticketing, Payment, Notification Maven verify and boundary gates; web lint/test/build; distributed E2E rehearsal through manual refund evidence and restock; `openspec validate buyer-refund-requests --type change --strict`.
