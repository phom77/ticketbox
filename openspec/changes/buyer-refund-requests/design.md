# Design

## Context

`order-support-and-event-refunds` provides: Payment refund cases with requester ≠ approver platform admins, manual merchant execution with verified evidence, Check-in admission holds before approval, a versioned confirmed-refund result applied by Ticketing (tickets cancelled, A3 updated, buyer notified once), and resumable postponement/cancellation operations that pause sales and prepare per-order cases for cancellation. Organizer FINANCE has read-only access to cases.

## Decisions

- **The request lives in Ticketing.** `refund_requests(id, order_id, buyer_id, reason, origin, status, decided_by, decision_note, created_at, decided_at, payment_case_id)` with `origin = BUYER | POSTPONEMENT` and status `REQUESTED | APPROVED | REJECTED | WITHDRAWN | REFUNDED | FAILED`. One open request per order (partial unique index). A `RefundRequest` domain object owns transitions.
- **Eligibility (checked under the order lock).** Order `PAID` with issued tickets; no ticket `USED` or `TRANSFERRED`; no pending transfer; no existing refund case; for `BUYER` origin, now is before `doors_open_at − 24h` and the event is not disrupted; for `POSTPONEMENT` origin, the event has an acknowledged postponement and the new date has not passed. Cancelled events are handled by the existing operation and reject buyer requests with a pointer to the options page.
- **Organizer decision.** Endpoint under `/api/organizer/manage/refund-requests` scoped by organization with the FINANCE grant (Identity organization access contract). Approve or reject with a required note on rejection. Decisions are audited with the actor from authentication. Platform admins can also decide (support fallback).
- **Hand-off to Payment.** On approval (or immediately for `POSTPONEMENT`), Ticketing freezes the issued ticket set and sends the existing case-creation command with two additive fields, `origin` and `refundRequestId`. The rest is unchanged: Check-in hold, dual-admin approval, manual merchant refund, evidence, confirmed-refund result. Ticketing updates the request to `REFUNDED` or `FAILED` from the result and from case abort.
- **Restock (ADR 0004).** When Ticketing applies a confirmed refund and the performance is on sale, not disrupted and before sale end, it releases the order's seats (reserved) or quantity (GA) back to stock in the same transaction that cancels the tickets, using the existing inventory locks and event ordering. Otherwise stock is unchanged, as today. Quotas: the buyer's per-account usage is reduced by the refunded quantity.
- **Options page.** Reads the event disruption state already published to Ticketing and the buyer's tickets. Postponed: new date, "Keep my ticket" (records the choice, no backend effect beyond hiding the banner) or "Request a refund". Cancelled: "Your refund is being processed" with the case status, no action.
- **Notifications.** Add `ticketing.refund-request-received|approved|rejected` (buyer) and `ticketing.refund-request-submitted` (organizer FINANCE members, in-app) to the notification command schema. Refunded uses the existing `ticketing.order-refunded`.

## Defaults to confirm in review

- Buyer request window: until 24 hours before doors.
- Full-order refunds only (as in the existing workflow); partial refunds stay out of scope.
- Organizer has no deadline to decide; the request stays visible in their queue and the buyer sees "Waiting for the organizer".

## Risks

- Restocking a refunded seat while a stale ticket snapshot exists at a scanner could admit two people. Mitigation: restock happens only after the confirmed refund revokes the tickets and Check-in has acknowledged the hold; offline scanning stays out of scope.
- Organizers may ignore requests. The platform queue lists requests older than 3 days for follow-up.

## Rollout

Migrations, Notification consumer, Payment additive field, then Ticketing endpoints, then web. ADR 0004 must be accepted before the restock task is merged; the rest can ship without restock.
