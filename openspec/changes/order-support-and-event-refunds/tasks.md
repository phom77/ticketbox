# Tasks

## 1. Support and exception triage

- [x] 1.1 Add `GET /api/admin/orders/support` and its `/api/organizer/manage/orders/support` counterpart alongside the current list. In Ticketing, query by `orderId`, `buyerEmail` or `transactionRef`, with page and size, using the Identity account lookup port and A3 projection. Verify results beyond page one, two organizations sharing a buyer, revoked grants, and Identity lookup failure.
- [x] 1.2 Add scoped order detail sections and platform exception pages. Read payment review and email delivery through owner ports. Wire the workspace and existing command affordances. Verify partial data on service loss, stable command replay, late money without ticket issuance, and access to only the selected organization.

## 2. Refund and event disruption

- [x] 2.1 Extend Payment's refund review model and Check-in's admission boundary. Verify different requester and approver, revoked admins, the concurrent scan-versus-hold case, admitted and missing tickets, replay and release after a verified no-refund decision.
- [x] 2.2 Record confirmed provider evidence and publish the versioned result. Add Ticketing order transition, ticket revocation, A3 reporting and deduplicated Notification. Verify conflicting references and excess amounts, duplicate/stale delivery, replay and partial delivery failure with unchanged stock. Verify late-money compensation on a terminal order with no tickets.
- [x] 2.3 Add Catalog event impact preview and resumable postponement and cancellation, with sale-pause acknowledgment and per-order cases. Verify concurrent settlement during cancellation, duplicate operations, buyer notice, preservation of valid postponed tickets, and no direct organizer bypass.

## 3. Integration and acceptance

- [ ] 3.1 Run strict OpenSpec validation, relevant Maven suites and independent builds for Ticketing, Payment, Catalog, Check-in, Identity and Notification, web lint/build, Chromium and shared CI. Rehearse gateway flows with two organizations, failed downstream delivery, compensation and restore. Record local fixtures and real merchant staging evidence separately.

Local implementation and fixture evidence are tracked in the [production roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md#triển-khai-a4-và-a5--12112026). Merchant execution and reconciliation are pending staging access. The scanner and stale offline datasets remain in the deferred scanner scope.
