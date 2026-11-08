# Frontend performance

- Measure the affected flow on a representative browser or device and network.
  For public routes, inspect initial asset cost, layout stability and interaction
  responsiveness. For scanner work, inspect dataset load and response time on
  representative hardware and data.
- Inspect bundle output and request waterfalls before adding lazy loading.
  Split expensive noncritical routes when the measurement supports it.
  Size images for their rendered use and reserve dimensions for posters.
- Check subscription cleanup, polling frequency, repeat API calls and stale
  requests. For the waiting room, measure active subscriptions and HTTP status
  traffic together before changing the reconnect or fallback behavior.
- Profile large concert, guest and order lists before adding virtualization or
  memoization. Keep pagination, stable order and keyboard access intact.
- For caches and prefetches, define freshness, invalidation and privacy. Verify
  stale or offline behavior and measure the same flow before and after.
