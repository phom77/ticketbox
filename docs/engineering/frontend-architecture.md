# Frontend architecture

## Ownership

- Keep web route registration and composition in
  [App.tsx](../../frontend/src/app/App.tsx). Pages coordinate routing, API calls
  and views. Keep role-specific behavior with the feature that owns it.
- Use the existing [web API modules](../../frontend/src/api/) for HTTP calls and
  [features](../../frontend/src/features/) for reusable feature behavior. Shared
  components should expose a small interface and remain independent of unrelated
  role workflows. Extract only when callers share behavior or ownership becomes
  hard to follow.
- In the scanner, screens coordinate the existing
  [API](../../mobile-scanner/src/api/), [feature](../../mobile-scanner/src/features/)
  and [database](../../mobile-scanner/src/database/) modules. Keep platform
  storage details behind the existing database interface.
- Pass explicit state and callbacks across component boundaries. Keep local
  interactions near their owner. Use shared state when multiple callers truly
  coordinate and avoid circular imports across features.

## Runtime boundaries

- The web app renders in the browser through the gateway. Treat bundled config
  as public. Preserve role redirects, deep links and loading/error behavior when
  changing routes.
- Clean up subscriptions, timers and object URLs with their owning lifecycle.
  Keep WebSocket subscription ownership clear across reconnects and unmounts.
- Route rewrites, new global state libraries and rendering or deployment changes
  need a concrete requirement and review. Follow the
  [decision guide](engineering-decisions.md).
