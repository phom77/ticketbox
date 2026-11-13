# Tasks

## 1. Buyer web navigation

- [x] 1.1 Remove inactive footer controls, use the existing buyer order and ticket routes, and remove unverified confirmation content. Verify direct navigation and reloads with Chromium while preserving checkout recovery.
- [x] 1.2 Add configurable support and terms links and show the organizer on published events. Verify missing configuration, draft scope, valid fixture destinations and mobile keyboard access. Approved destinations are part of staging acceptance.

## 2. Account recovery

- [x] 2.1 Add Identity reset request and confirmation under `/api/auth/password-reset` and `/api/auth/password-reset/confirm`. Add the reset migration, rate limits and the private Notification delivery worker. Verify neutral responses, single consumption, expiry, supersession, delivery failure and a subsequent retry through the SMTP sink outside the buyer notification feed.
- [x] 2.2 Require current buyer sessions on protected HTTP and private queue STOMP boundaries and connect the accessible reset page and login entry point. Verify stale and unavailable sessions through the STOMP interceptor, protected HTTP routes through the gateway, and lost checkout responses through Chromium.

## 3. Integration and acceptance

- [x] 3.1 Exercise checkout on a phone viewport from selecting a ticket to opening the issued QR after reload. Verify return before IPN, a lost create response, successful payment, failed or expired orders and the existing safe retry. Run the checkout recovery suite and a local gateway journey.
- [ ] 3.2 Run strict OpenSpec validation, relevant Maven suites and independent builds for Identity, Notification, Catalog and Ticketing, web lint/build and shared CI. Verify staging mail delivery and approved support and terms destinations separately from local fixtures.

Local gateway, Chromium and repository checks are tracked in the [production roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md#triển-khai-a4-và-a5--12112026). Staging requires the deployed relay and approved support and terms destinations.
