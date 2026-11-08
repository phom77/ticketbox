# Frontend state, data and forms

## Ownership and freshness

- Classify state as local interaction, route or URL state, server-owned data,
  derived values, or persisted preferences. Derive display totals and filters
  when possible. Keep pending, success and failure states consistent.
- Reuse the [web API client](../../frontend/src/api/client.ts) and existing
  feature helpers. Define when data refreshes and how a mutation invalidates or
  reconciles it. Use URLs for shareable filters where appropriate and keep
  private data out of URL parameters.
- Cancel or ignore stale responses when the route, selected concert, query or
  component changes. For example, a result from the previous concert must not
  replace the current concert's inventory.
- Preserve the queue status fallback when changing realtime updates. Preserve
  [checkout recovery](../../frontend/src/features/ticket/checkoutRecovery.ts)
  after a lost response. A retry must keep the original order identity where
  the API requires it.

## Forms and offline work

- Keep input on recoverable errors, associate validation messages with fields,
  and show the submit state. Prevent accidental repeat submits and preserve
  server-side validation and idempotency.
- Distinguish forbidden, missing, throttled and temporarily unavailable
  responses when users need different recovery actions. Use optimistic updates
  only with a defined reconciliation path.
- Keep pending scans across reconnects on native devices. Preserve the
  distinction between pending, accepted, conflicted and failed entries during
  [scanner sync](../../mobile-scanner/README.md#offline-workflow). Verify reload
  behavior separately in the browser variant.
