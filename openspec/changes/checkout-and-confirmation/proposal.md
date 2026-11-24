# Proposal

## Why

Checkout shows only a payment method list and an order summary. A failed payment forces the buyer to cancel the order and queue again, leaving checkout uses `window.confirm`, the payment result page shows a bare status panel while the order is confirmed, and the confirmation page works only from router state, so it cannot be opened from a link or an email.

This change is U5 of the buyer UI/UX redesign plan.

## What Changes

- **Checkout.** Contact and delivery (account email and phone, edited in the account page), payment method cards with a provider mark and a redirect note, terms acceptance (required only when `VITE_TERMS_URL` is configured), and an order summary with poster, event, date, venue, lines, one all-in total and the reference code. The payment deadline uses the shared `HoldTimer`.
- **Payment failed.** The buyer sees the reason and can try another payment method on the same order through the existing `POST /api/orders/{id}/retry-payment`. Cancelling the order is secondary and asks for confirmation in the shared modal instead of `window.confirm`.
- **Payment processing.** `/payment/result` (still the gateway return route) shows a full-page "Confirming your payment" with a spinner and the steps payment received, order confirmed and tickets issued. Review and long-pending states show the reference, a support link and an email promise.
- **Confirmation.** New `/orders/:orderId/confirmation` loads the order from the server, shows tickets with QR codes, directions, the order summary and what to do next. `/booking-confirmation` redirects to it when it carries an order id.
- Recovery semantics are unchanged: idempotent order creation, remembered pending payment, bfcache re-read and the shared order outcome.

## Out of scope

- Add to calendar: it needs the calendar helper from U3 and is added when that lands.
- Order detail page (U6). "Order details" links to the order history tab for now.
- No backend, contract or migration change. Tickets carry no order id, so they are matched to the order by event, issue time and ticket type.
