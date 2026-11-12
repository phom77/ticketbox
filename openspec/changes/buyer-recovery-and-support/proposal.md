# Proposal

## Why

Buyers need to recover their account, order and tickets from a phone after losing access or leaving the checkout. Published events and order pages need usable links to support and purchase terms.

## What Changes

- Replace inactive links and newsletter controls with usable navigation. Show event organizer, order history, tickets and approved support and terms links.
- Add email-based password recovery with uniform request responses, short-lived single-use tokens and session invalidation.
- Test mobile checkout and QR recovery. Use verified server state to distinguish waiting, paid, failed and expired orders and retain the current recovery key across reloads.
- Keep one payment attempt per order. The previously deferred scanner UI, offline and device work remain in the scanner project.

## Capabilities

### New Capabilities

- `buyer-recovery` — Buyer account recovery, checkout recovery and access to tickets and support.

### Modified Capabilities

None.

## Impact

Identity and Notification own recovery and delivery. Ticketing protects order and ticket access with current buyer sessions. Catalog supplies approved organizer display information. The web app uses existing A3 checkout state and the approved pilot support and terms inputs. See [roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md) and [A3](../vnpay-merchant-and-sales-reconciliation/design.md).
