# Design

## Context

A3 already recovers checkout by idempotency key and waits for verified server status after provider return. The web app has order history and QR views. Identity stores a session version and checks it on current-session routes. Ticketing and Notification still accept locally verified buyer JWTs on private routes. The deployed mail transport and the approved public support and terms links are separate inputs.

## Goals and boundaries

Deliver buyer account and checkout recovery using existing order, ticket and payment ownership. The public recovery flow is for active AUDIENCE accounts. Privileged accounts use their existing operator process. Keep the one-attempt policy and the existing scanner deferral.

## Decisions

- **Use the existing buyer routes.** Link to `/profile?tab=orders` and `/my-tickets`. Without verified order data, direct confirmation visits show an order-history action. Keep checkout command identity in the existing browser recovery path. Add only verified status actions and responsive affordances to the current checkout and result views.
- **Render configured support and policy information.** Read environment-approved support and terms links and show them only when configured. Catalog supplies the approved organization display name on published events through an additive field. Preserve draft privacy. Keep merchant and refund-policy language in the approved policy destination.
- **Keep reset authority in Identity.** The public request endpoint accepts an email and always returns the same acceptance response. Apply rate budgets by trusted client identity and a digest of the normalized address, including nonexistent accounts. Generate an opaque high-entropy token with a 30-minute lifetime and persist its digest. Serialize issuance and consumption per account. A new request supersedes earlier tokens, and successful consumption updates the password, increments the session version and invalidates other outstanding reset tokens in one transaction. Return a generic invalid-or-expired response and require sign-in with the new password.
- **Deliver email through Notification.** A durable Identity command carries a dedicated email-only reset message with a stable deduplication identity. Encrypt the bearer value in queued storage using a deployment secret and exclude it from buyer and admin feeds, public APIs and logs. Use the configured web origin for the link. The worker rechecks validity with Identity before sending, drops expired or superseded messages and removes bearer material from storage after processing. Keep delivery acceptance independent of the public response. A mail outage allows later delivery while the link remains valid or a new request after expiry.
- **Enforce session invalidation at protected boundaries.** Reuse Identity current-session checks in Ticketing and Notification for authenticated buyer actions including queue, holds, order, tickets, payment and private notifications. Check current sessions before accepting private STOMP subscriptions and before sending private queue updates to a session, including connections open during a reset. Preserve public browse, provider callbacks and internal commands. A stale HTTP session returns 401 and prompts login. An unavailable Identity returns 503 for protected HTTP requests and private socket messages are withheld. The order recovery key survives temporary service failure.

## Risks and trade-offs

- An enumerable or reusable token would expose a buyer account. Keep request responses uniform, check token and account eligibility atomically and test expiry, two concurrent submissions and mail failure.
- A reset link can appear in browser history or referrers. Use an approved HTTPS origin on staging, keep the secret out of server URLs, remove it from the address bar once loaded and suppress referrers on the reset route. Never save it in browser persistent storage.
- Current-session validation introduces an Identity dependency for private buyer routes. Preserve public availability and distinguish an outage from an expired session so a transient failure does not cause the user to lose an order recovery key.

## Migration and rollout

Deploy the Notification command consumer and current-session checks before exposing password recovery. Add reset state with a new Identity migration. Local acceptance uses the SMTP sink. Staging verifies delivery with the configured sender and support and policy destinations. On rollback hide the request form and allow already sent valid links to finish until expiry while keeping session enforcement active.
