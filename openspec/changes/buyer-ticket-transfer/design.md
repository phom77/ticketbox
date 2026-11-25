# Design

## Context

Tickets carry `user_id` (the holder) and are issued per order item. Check-in projects ticket snapshots and treats `CANCELLED` and `TRANSFERRED` as invalid. Ticketing already resolves an exact email to an account through Identity for support search. Refund approval is blocked when any affected ticket was transferred.

## Decisions

- **Model.** `ticket_transfers(id, ticket_id, sender_id, recipient_id, status, created_at, decided_at, expires_at, new_ticket_id)` with status `PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED`, a partial unique index allowing one `PENDING` per ticket, and `tickets.transferred_from_ticket_id` for lineage. A `TicketTransfer` domain object owns the transitions; the use case coordinates the lock and the stores.
- **Acceptance is one Ticketing transaction.** Under the existing order row lock: re-check the rules, set the original ticket `TRANSFERRED`, insert a new ticket (same order item, ticket type, seat and performance; recipient `user_id`; new `qr_code`/`qr_secret`; `transferred_from_ticket_id`), mark the transfer `ACCEPTED`, and write both ticket snapshots and the notification commands to the outbox. The seat and stock are untouched: the order still owns the inventory.
- **Rules are checked at offer and at accept.** `VALID` status; original purchase (no lineage); before `doors_open_at − 2h` in the performance time zone (event date when doors are unknown); no open refund request, refund case or admission hold on the order; no disruption barrier on the event; recipient is a different, active audience account. Offer creation is idempotent per (ticket, recipient) while pending.
- **Expiry.** A scheduled job in Ticketing marks pending offers `EXPIRED` at `expires_at` (the cut-off), using the existing scheduler registration in `config`.
- **Privacy.** The sender types the exact email. Ticketing answers "no TicketBox account uses this email" without revealing anything else, and rate-limits offers per sender. The recipient sees the sender's display name only.
- **Notifications.** Add `ticketing.ticket-transfer-offered|accepted|declined|cancelled|expired` to the notification command schema with payload `{transferId, ticketId, concertId, concertTitle, eventDate, otherPartyName}`. This is an additive change to v1: Notification is deployed first and ignores nothing it already handles; Ticketing only emits the new types after the consumer is live. `scripts/ci/verify-service-boundaries.py` and the contract fixtures are updated in the same change.
- **Web.** Ticket page: "Transfer ticket" (email field, rules, confirm step), pending banner with "Cancel transfer", and "Received from {name}" on received tickets (no Transfer button). Recipient: offer page `/my-tickets/transfers/:transferId` with Accept/Decline. Order detail shows transferred tickets as "Transferred to {name}".

## Interactions with refunds

A pending transfer blocks a refund request on the same order, and an open refund request blocks new transfers. A completed transfer keeps the existing rule: the order can no longer use the standard refund workflow.

## Risks

- A scanner holding an offline snapshot could admit the old QR. The pilot requires online admission (existing decision); the offline scanner design must honour `TRANSFERRED`.
- Email typos send a ticket to the wrong account. Mitigation: the confirm step shows the recipient's display name before sending, and the sender can cancel until acceptance.

## Rollout

Migration first, then Notification consumer, then Ticketing endpoints behind the web action. Rollback leaves accepted transfers valid; pending offers can be cancelled by the sender or expire.
