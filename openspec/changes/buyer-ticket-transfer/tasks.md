# Tasks

## 1. Ticketing

- [x] 1.1 Migration: `ticket_transfers`, `tickets.transferred_from_ticket_id`. `TicketTransfer` domain transitions with unit tests.
- [x] 1.2 Use cases and buyer endpoints: create offer, cancel, accept, decline, list mine (sent and received). Accept under the order lock, issue the new ticket, write snapshots and notification commands. Integration tests: concurrent accept vs cancel, accept after cut-off, offer on held/refund-requested order, re-transfer rejected, recipient equals sender, unknown email.
- [x] 1.3 Expiry job and ArchitectureTest/java-suites updates.

## 2. Contracts and Notification

- [x] 2.1 Add the five transfer event types to the notification command schema and Notification templates (en/vi email, APP inbox). Update boundary checks and contract fixtures.

## 3. Web

- [x] 3.1 Ticket page transfer flow, pending state, received label; offer page; notification links. en/vi strings. Vitest for rules display and state.
- [x] 3.2 Mocked browser fixture: offer → accept → old QR gone, new ticket in recipient wallet; cancel; expired.

## 4. Verification

- [ ] 4.1 Ticketing and Notification Maven verify, boundary gate, web lint/test/build, distributed E2E transfer rehearsal with Check-in rejecting the old QR, `openspec validate buyer-ticket-transfer --type change --strict`.
