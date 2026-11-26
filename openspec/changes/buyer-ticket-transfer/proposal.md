# Proposal

## Why

Buyers cannot give a ticket to a friend. Today the only transfer is an admin status change (`VALID → TRANSFERRED`) that issues nothing to anyone. Ticketmaster-style self-service transfer is the most requested post-purchase action and part of U7 of the buyer redesign.

## What Changes

- A buyer can transfer a valid ticket from the ticket page to an existing TicketBox account, identified by its exact email.
- The recipient sees the offer in notifications and My tickets and accepts or declines it. The sender can cancel until the recipient accepts.
- On acceptance, Ticketing marks the original ticket `TRANSFERRED` and issues a new ticket with a new QR code to the recipient, in one transaction under the order lock. Check-in receives both changes through the existing ticket snapshots, so the old QR stops working.
- Rules: only `VALID` tickets, only before 2 hours before doors, not while a refund request or refund hold covers the order, not during an event disruption, and a received ticket cannot be transferred again. An offer expires at the cut-off if not accepted.
- Both people get an in-app and email notification for offered, accepted, declined, cancelled and expired.

## Capabilities

### New Capabilities

- `buyer-ticket-transfer` — offer, accept, decline, cancel and expire a ticket transfer.

### Modified Capabilities

- `buyer-ticket-wallet` — ticket page shows Transfer, pending state and "Received from".
- `buyer-notification-inbox` — transfer notifications link to the ticket or offer.

## Impact

- **Ticketing:** new `ticket_transfers` table and transfer use cases in the issuance capability; recipient lookup through the existing Identity account lookup port; emits existing ticket snapshot v1/v2 (no schema change).
- **Notification:** five new command event types (additive, see design).
- **Check-in:** no code change expected; it already rejects `TRANSFERRED` tickets and projects new ones. Verified by fixture.
- **Web:** ticket page actions, offer screen, notifications. **Significant decision:** extends a cross-service contract (notification commands), so this proposal needs approval before implementation per `AGENTS.md`.
