# Frontend security

- Treat API responses, URL parameters, embedded content and browser storage as
  untrusted. Use the existing API clients and role route handling. The service
  must still authorize each action and check resource ownership.
- Render plain text by default. For rich content, sanitize at the render boundary
  with an allowlist appropriate to the content. Seat-map views should reuse the
  [sanitized component](../../frontend/src/components/ConcertSeatMap.tsx).
  Cover both newly uploaded content and content already stored by the API.
- Review untrusted navigation targets, links, file metadata and resource URLs.
  Keep client-side upload checks for feedback and enforce limits and validation
  at the service boundary.
- Preserve the current bearer-token flow and deliberate logout/expiry handling.
  Changes to token storage, cookies or cross-origin requests need security
  review, including CSRF implications if browser credentials are sent
  automatically. Follow the [scanner guide](../../mobile-scanner/README.md)
  for public client config and local-network setup.
- Keep credentials out of Vite and Expo public variables. Keep tickets,
  guest details, tokens and other private values out of URLs, analytics, client
  logs and shared caches. Review access to persisted offline datasets.
