# Proposal

## Why

Refunds today start only from platform operators (`order-support-and-event-refunds`). A buyer who cannot attend, or whose event was postponed or cancelled, has no way to ask for their money back or see what will happen. U7 adds buyer self-service on top of the existing, audited refund workflow.

## What Changes

- **Refund request.** From order detail, a buyer can request a full-order refund with a reason until 24 hours before doors. The order shows the request status: Requested → Approved/Rejected → Refunded.
- **Organizer decision.** Organization members with the FINANCE grant see requests for their events in the organizer workspace and approve or reject them with a note. Approval opens a platform refund case in the existing workflow (dual platform-admin approval, manual merchant refund, verified evidence). Rejection notifies the buyer with the note.
- **Disrupted events skip the organizer.** For a postponed event the buyer can choose Keep my ticket or Request a refund at any time before the new date; the refund request goes straight to a platform case. For a cancelled event the existing disruption operation already prepares refund cases; the buyer sees their status and does not need to act.
- **"Your options" page.** `/my-tickets/events/:eventId/options` explains what changed (new date or cancellation) and the buyer's choices. My tickets and the ticket page show a disruption banner linking to it.
- **Seat returns to sale.** When a refund is confirmed for an event that is still on sale and not disrupted, the refunded seats or GA quantity return to inventory. **This changes an accepted decision** ("refund application does not restock the sale"); the change is recorded as ADR 0004 for approval.
- Notifications for request received, approved, rejected and refunded.

## Capabilities

### New Capabilities

- `buyer-refund-requests` — buyer request, organizer decision and status.
- `buyer-disruption-options` — options page and banners for postponed or cancelled events.

### Modified Capabilities

- `event-refunds` — cases can originate from an approved buyer request; confirmed refunds may restock (ADR 0004).
- `buyer-account-access` — order detail shows request action and status.
- `buyer-notification-inbox` — refund request notifications.

## Impact

- **Ticketing:** `refund_requests` table, buyer and organizer endpoints, request → Payment case command, restock on confirmed refund result.
- **Payment:** accept a case opened from an approved request (additive field on the existing case command, origin and request id).
- **Notification:** four new command event types (additive).
- **Catalog:** none (disruption state is already published).
- **Web:** order detail, options page, banners, organizer requests queue.
- **Significant decisions** needing approval per `AGENTS.md`: the stock guarantee change (ADR 0004) and the contract additions.
