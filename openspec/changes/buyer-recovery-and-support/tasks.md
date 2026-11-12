# Tasks

## 1. Buyer web navigation

- [x] 1.1 Remove inactive footer controls, use the existing buyer order and ticket routes, and remove unverified confirmation content. Verify direct navigation and reloads with Chromium while preserving checkout recovery.
- [ ] 1.2 Add approved support and terms links and show the organizer on published events. Verify missing configuration, draft scope, valid destinations and mobile keyboard access.

## 2. Account recovery

- [ ] 2.1 Add Identity reset request and confirmation under `/api/auth/password-reset` and `/api/auth/password-reset/confirm`. Add the reset migration, rate limits and a Notification email command. Verify neutral responses, single consumption, expiry, supersession, no bearer data in logs or feeds, delivery failure and a subsequent retry through the SMTP sink.
- [ ] 2.2 Require current buyer sessions on protected HTTP and private queue STOMP boundaries and connect the accessible reset page and login entry point. Verify old JWTs cannot receive private queue updates, read orders, QR or notifications or initiate payment. Verify Identity outage responses preserve the checkout recovery key and provider callbacks still settle.

## 3. Integration and acceptance

- [x] 3.1 Exercise checkout on a phone viewport from selecting a ticket to opening the issued QR after reload. Verify return before IPN, a lost create response, successful payment, failed or expired orders and the existing safe retry. Run the checkout recovery suite and a local gateway journey.
- [ ] 3.2 Run strict OpenSpec validation, relevant Maven suites and independent builds for Identity, Notification, Catalog and Ticketing, web lint/build and shared CI. Verify staging mail delivery and approved support and terms destinations separately from local fixtures.
