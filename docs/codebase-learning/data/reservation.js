const reservationData = (() => {
  const t = (file, start, end, symbol, excerpt) => java('ticketing', file, start, end, symbol, excerpt);
  const reserve = (start, end, excerpt) => t('inventory/hold/application/ReservationService', start, end, 'ReservationService.reserve', excerpt);
  const controller = t('inventory/hold/web/ReservationController', 19, 40, 'ReservationController.reserve');
  const controllerReads = t('inventory/hold/web/ReservationController', 60, 77, 'ReservationController.getHolds');
  const seatSelection = source('frontend/src/pages/customer/SeatSelectionPage.tsx', 194, 239, 'SeatSelectionPage.updateQuantity');
  const http = source('frontend/src/api/reservations.ts', 16, 31, 'reserveTicket');
  const security = t('config/SecurityConfig', 151, 164, 'Audience authorization and JWT filter');
  const rateWiring = t('config/WebMvcConfig', 18, 31, 'Reservation rate-limit interceptor registration');
  const rateLimit = t('web/PurchasePaymentRateLimitInterceptor', 47, 87, 'Per-caller and global purchase limits');
  const rateRedis = t('infrastructure/redis/TokenBucketRateLimiter', 81, 95, 'Redis token-bucket script execution');
  const exceptionHandler = t('web/GlobalExceptionHandler', 24, 30, 'Domain errors use ErrorHttpMapping');
  const dto = t('inventory/hold/application/dto/ReserveTicketRequest', 9, 15, 'ReserveTicketRequest');
  const lock = t('inventory/hold/infrastructure/PurchaseGuard', 12, 32, 'PurchaseGuard.lock');
  const shop = t('queue/domain/ShoppingSession', 7, 18, 'ShoppingSession.authorize and requireToken');
  const redisToken = t('queue/infrastructure/WaitingRoomService', 418, 424, 'WaitingRoomService.validateAccess');
  const redisTtl = t('infrastructure/redis/RedisPurchaseSessions', 35, 38, 'RedisPurchaseSessions.remainingSeconds');
  const projection = t('infrastructure/integration/catalog/TicketingCatalogProjection', 107, 128, 'TicketingCatalogProjection.findTicketTypesByIds');
  const cleanup = t('inventory/hold/application/ReservationService', 200, 220, 'ReservationService.removeStaleHold and releaseAndDelete');
  const quota = reserve(77, 94, 'if (alreadyOrdered + alreadyHeld + quantityRequest > type.maxPerAccount()) {');
  const update = t('inventory/infrastructure/TicketingInventory', 29, 39, 'TicketingInventory.reserve',
    'UPDATE ticket_inventory SET available_qty=available_qty-?,');
  const quantity = t('inventory/domain/TicketQuantity', 5, 9, 'TicketQuantity');
  const save = reserve(102, 118, 'return ticketHoldRepository.save(hold);');
  const active = t('inventory/hold/application/ReservationService', 40, 41, 'ReservationService.ACTIVE_STATUSES');
  const errorMapping = t('web/ErrorHttpMapping', 9, 36, 'ErrorHttpMapping.status');
  const outbox = java('catalog', 'sales/infrastructure/CatalogPublisher', 108, 126, 'CatalogPublisher · versioned snapshot POST');
  const ingest = t('infrastructure/integration/catalog/TicketingCatalogReceiver', 56, 120, 'TicketingCatalogReceiver · local snapshot and stock updates');
  const expiryWorker = t('inventory/hold/application/HoldCleanupWorker', 19, 27, 'HoldCleanupWorker');
  const expiryCleanup = t('inventory/hold/application/ReservationService', 175, 182, 'ReservationService.cleanupExpiredHoldsForOwner');
  const leave = t('queue/infrastructure/WaitingRoomService', 288, 308, 'WaitingRoomService.leave · local event publication');
  const leaveListener = t('inventory/hold/application/UserLeftQueueListener', 17, 26, 'UserLeftQueueListener');
  const releaseSession = t('inventory/hold/application/ReservationService', 190, 198, 'ReservationService.releaseHoldsForSession');
  const tests = (start, end, symbol) => source(
    'services/ticketing/src/test/java/org/ticketbox/ticketing/order/application/OrderConcurrencyIntegrationTest.java',
    start, end, symbol);
  const ownerTest = tests(464, 492, 'Concurrent holds for one buyer');
  const cleanupTest = tests(494, 528, 'Concurrent expiry cleanup and stale session release');
  const springTx = reserve(43, 57, '@Transactional');
  const txEvidence = [springTx,
    t('inventory/infrastructure/TicketingInventory', 14, 18, 'Transactional inventory adapter'),
    t('application/error/AppException', 3, 14, 'AppException extends RuntimeException'), save];

  const step = (id, title, participant, from, to, transport, summary, input, output, store, delta, state, boundary, ...evidence) =>
    ({ ...confirmed(id, summary, ...evidence), title, participant, from, to, transport, input, output, store, delta, state, boundary });
  const entry = (id, title, summary, ...evidence) => ({ ...confirmed(id, summary, ...evidence), title });
  const story = confirmed('story-hold', 'One shopper requests an increment to a temporary ticket hold.', seatSelection, controller, reserve(77, 118),
    t('order/application/OrderService', 204, 268, 'Checkout applies and deletes the matching holds'));

  const steps = [
    step('step-request', 'Send the reservation', 'Seat Selection and Nginx', 'React web', 'Ticketing via Nginx', 'Synchronous HTTP',
      'Seat Selection checks the stored admission and visible availability, then posts quantity 1 with the queue token. The gateway’s /api/ fallback sends the reservation to Ticketing.',
      'Concert ID, ticket-type ID, quantity 1, bearer JWT and queue access token.', 'POST /api/reservations/concerts/{concertId}/ticket-types/{ticketTypeId}/reserve',
      'Browser', 'Request sent.', '8 available · no hold.', 'Before the Ticketing write transaction.',
      seatSelection, http, source('frontend/src/api/client.ts', 45, 66, 'Attach bearer and unwrap response'),
      source('infra/nginx/gateway.conf', 42, 49, 'Catalog regex and Ticketing fallback')),
    step('step-controller', 'Authenticate and validate', 'Ticketing web adapter', 'Security filter and controller', 'ReservationService.reserve', 'In-process call',
      'Ticketing’s JWT filter establishes the principal and the route requires AUDIENCE. When registered, the purchase limiter consumes Redis rate-limit budget before the controller. The controller validates the body, uses the authenticated user UUID and passes the request to the application service.',
      'Authenticated request and quantity. The body field defaults to 1 in its DTO and has a minimum of 1.', 'A reserve command for the authenticated user.',
      'Ticketing web', 'No stock write.', '8 available · no hold.', 'The controller calls the transactional application service.',
      security, t('web/security/JwtAuthenticationFilter', 37, 66, 'Local bearer-token authentication'), rateWiring, rateLimit, rateRedis, dto, controller),
    step('step-lock', 'Lock this buyer and concert', 'Application and PostgreSQL guard', 'ReservationService', 'PostgreSQL · purchase_guards', 'Synchronous SQL',
      'The write transaction starts. The guard ensures that requests using this lock for the same buyer and concert serialize. It inserts the guard row if necessary, then selects it FOR UPDATE.',
      'Buyer UUID and concert UUID.', 'Transaction-scoped row lock.',
      'Ticketing DB', 'Owner lock acquired.', '8 available · no hold · owner guard locked.', 'Inside the PostgreSQL write transaction.',
      springTx, lock, migration('ticketing', 'V1__owned_schema', 217, 218, 'Guard composite primary key')),
    step('step-session', 'Check shopping-session access', 'Redis adapter and domain rule', 'ReservationService', 'Redis + ShoppingSession', 'Synchronous Redis reads and in-process validation',
      'Ticketing reads the session token for this concert and user. ShoppingSession checks the presented token. A separate Redis TTL read must return positive seconds, which Ticketing adds to the current time for the hold expiry.',
      'Presented token, stored token and remaining TTL.', 'Matching token and an expiry timestamp.',
      'Redis', 'Read token and TTL.', 'Live session read · 8 available · no hold.', 'Redis reads occur during the operation. The PostgreSQL transaction does not govern Redis.',
      redisToken, shop, redisTtl, springTx),
    step('step-quota', 'Check type and account quota', 'Application and local read projection', 'ReservationService', 'Ticketing PostgreSQL', 'Synchronous local SQL reads',
      'Ticketing reads its local ticket-type projection, checks concert membership and activity, and removes an expired or previous-session hold for that type if present. It compares active order quantity plus held quantity plus the request with maxPerAccount.',
      'Projected max 2, ordered 0, held 0, request 1.', '0 + 0 + 1 is within 2. The stock write can proceed.',
      'Ticketing DB', 'Quota passes.', '8 available · no hold to clean up.', 'The guard still covers the buyer’s quota check. Catalog snapshot delivery is separate.',
      reserve(59, 77), projection, cleanup, active, quota,
      t('order/infrastructure/persistence/JpaOrderItemRepository', 22, 34, 'Order item sum for active statuses')),
    step('step-stock', 'Take one unit from stock', 'Domain quantity and SQL adapter', 'InventoryPort / TicketQuantity', 'PostgreSQL · ticket_inventory', 'In-process validation and conditional SQL UPDATE',
      'TicketQuantity enforces positivity at the adapter boundary. The SQL subtracts the requested quantity only if the stock row is active and can cover it. A zero-row update becomes TICKET_SOLD_OUT.',
      'Ticket-type ID and positive quantity 1.', 'One updated stock row.',
      'Ticketing DB', '8 → 7 available, pending.', '7 available inside the transaction · hold write still pending.', 'This stock write shares the reserve transaction.',
      quantity, t('inventory/infrastructure/TicketingInventory', 80, 82, 'Inventory positive check'), update, reserve(96, 100)),
    step('step-hold', 'Record the hold', 'Domain model and JPA repository', 'TicketHold / repository', 'PostgreSQL · ticket_holds', 'In-process domain update and JPA persistence',
      'The application builds a TicketHold or increments the existing one, sets expiry and associates it with the queue token. TicketHold carries the state. The application and persistence boundaries enforce the quota and stock rules.',
      'Owner, ticket type, quantity and sampled expiry.', 'Hold with quantity 1 and expiry.',
      'Ticketing DB', 'Hold quantity 1, pending.', '7 available · 1 held, both pending until commit.', 'Stock and hold persistence share the reserve transaction.',
      save, t('inventory/hold/domain/TicketHold', 12, 27, 'TicketHold fields'),
      t('inventory/hold/infrastructure/persistence/JpaTicketHoldRepository', 12, 28, 'Spring Data hold adapter'),
      source('services/ticketing/src/main/resources/META-INF/orm.xml', 117, 139, 'TicketHold ORM mapping'),
      migration('ticketing', 'V1__owned_schema', 103, 125, 'Hold and inventory constraints'),
      migration('ticketing', 'V1__owned_schema', 262, 263, 'One hold per user, concert and type')),
    step('step-response', 'Commit and return the hold', 'Controller and browser', 'Ticketing', 'React web', 'Synchronous HTTP response',
      'On successful return from the transactional call, the controller builds HTTP 200 with the ticket type, total held quantity and expiry. The Seat Selection page increments its local quantity after success and refreshes.',
      'Successful stock and hold transaction.', 'HTTP 200 with ticketTypeId, quantity and expiresAt.',
      'Browser + DB', '7 available · 1 held, committed.', '7 available · 1 held · no order or issued ticket created by reserve.',
      'The transaction ends before the controller returns the response. Reserve has no event publication call.',
      springTx, save, controller, seatSelection),
  ];

  const rules = [
    entry('rule-boundary', 'A valid login and a live shopping session are both required',
      'The security filter checks the AUDIENCE role. A caller that bypasses the browser’s visible-stock or admission checks still reaches Ticketing’s server checks. The session token must be nonblank and match, and its sampled TTL must be positive.',
      seatSelection, security, shop, redisToken, redisTtl, springTx),
    entry('rule-rate', 'The rate limit can stop a request before the stock transaction',
      'When the MVC purchase interceptor is registered, it checks per-caller and global budgets in Redis. A denied budget returns HTTP 429. This Redis activity belongs to a different boundary from the shopping-session reads inside the reserve operation.',
      rateWiring, rateLimit, rateRedis, errorMapping),
    entry('rule-sale', 'Reserve and checkout enforce different sale checks',
      'Reserve checks the projected ticket type’s activity and concert membership. The checkout path separately checks ON_SALE and the sale window and can allocate a stock shortfall when no matching hold exists.',
      reserve(59, 75), t('order/application/OrderService', 109, 132, 'Checkout concert sale checks'),
      t('order/application/OrderService', 204, 240, 'Checkout hold and stock delta')),
    entry('rule-concurrency', 'Two protections cover different races',
      'The purchase guard comment identifies its purpose as serializing reserve, release and conversion for the same owner even if a Redis lease expires. The account cap includes AWAITING_PAYMENT and PAID orders and the current hold. Across buyers, the conditional stock UPDATE protects the shared ticket-type row. The integration test source contains a concurrent same-buyer quota case.',
      lock, active, quota, update, ownerTest),
    entry('rule-async', 'Catalog sync and queue cleanup run separately',
      'Catalog delivers versioned sale snapshots over internal HTTP. Ticketing’s reserve reads the local projection and publishes no event. Catalog can later observe changed availability by polling Ticketing. A separate local Spring UserLeftQueueEvent can release holds for its matching session. A scheduled worker also releases expired holds.',
      outbox, ingest, projection, reserve(43, 118),
      java('catalog', 'sales/infrastructure/CatalogPublisher', 129, 149, 'Scheduled stock pull'),
      leave, leaveListener, releaseSession, expiryWorker, expiryCleanup),
    { ...entry('rule-why', 'Why keep the stock decrement and hold together?',
      'The transaction suggests that the two writes represent one allocation. If an unchecked error escapes before commit, the expected Spring transaction outcome is rollback of the pending PostgreSQL writes, including any stale-hold cleanup in that call. Redis reads and the eventual HTTP response sit outside that atomic guarantee.',
      ...txEvidence, cleanup), status: 'inferred' },
  ];

  const failures = [
    entry('fail-session', 'Missing or expired session',
      'With a valid AUDIENCE login but a missing or mismatched queue token, the session check rejects the call. A non-positive or null TTL also rejects it. These shopping-session errors map to HTTP 403 and the request never reaches the stock update.',
      shop, springTx, redisToken, exceptionHandler, errorMapping),
    entry('fail-quota', 'Above the account limit',
      'Example: with cap 4, two active-order tickets and one already held, a request for two would reach 5. Ticketing raises TICKET_LIMIT_EXCEEDED (HTTP 409) before trying the stock decrement.',
      active, quota, errorMapping),
    entry('fail-stock', 'Another buyer takes the last unit',
      'The per-owner locks can differ. If the competing decrement wins and the row can no longer cover this request, the conditional UPDATE changes zero rows. Reserve maps that result to TICKET_SOLD_OUT (HTTP 409). An inactive stock row can also miss the predicate.',
      lock, update, reserve(96, 100), errorMapping),
    entry('fail-retry', 'Response lost, same POST repeated',
      'If the first call committed and the next one still passes all checks, the second call adds quantity again. The controller has no Idempotency-Key input for reserve. The split E2E script shares headers with checkout, but its reserve header does not create a replay guarantee. GET holds can show the current session’s holds.',
      controller, save, controllerReads,
      source('scripts/e2e/split.py', 185, 193, 'Shared reserve and checkout headers')),
    { ...entry('fail-write', 'Hold write fails after stock update',
      'Expected from the transaction annotation and unchecked exception handling: the pending stock decrement rolls back with the failed hold write. A source read cannot confirm how a particular injected database or transport fault surfaces.',
      ...txEvidence), status: 'inferred' },
  ];

  const quiz = [
    entry('quiz-cap', 'Twenty units are in stock. Cap 4, two active-order tickets, one held, two requested. What happens first?',
      'The account limit rejects the request with a conflict. The total would be 5, so the stock UPDATE is never attempted.', active, quota, errorMapping),
    entry('quiz-race', 'Two different buyers reach the last unit. Which boundary prevents two successful holds?',
      'The guarded inventory UPDATE. The user/concert guard serializes a single buyer’s operations, and these buyers have distinct guard keys.', lock, update),
    entry('quiz-expiry', 'The Redis shopping session expires. Is PostgreSQL stock immediately available again?',
      'The token or TTL check now blocks reserve. Stock returns when a separate cleanup operation releases and deletes the hold. The scheduled worker and the token-matched leave listener are two distinct paths.',
      springTx, expiryWorker, expiryCleanup, releaseSession, cleanupTest),
    entry('quiz-event', 'How can Catalog learn that seven units remain after the hold?',
      'Catalog initiates a later GET to Ticketing’s stock endpoint and refreshes its availability view. The reserve request does not send Catalog an event.',
      reserve(43, 118), java('catalog', 'sales/infrastructure/CatalogPublisher', 129, 149, 'Catalog stock poll'),
      t('inventory/web/StockApi', 17, 21, 'Ticketing stock endpoint')),
  ];

  const impact = {
    ...entry('impact-hold-replay', 'Where to investigate',
      'Start at the reservation HTTP contract and ReservationService transaction. Consider how an operation key and its stored outcome would commit with the stock and hold, and whether retries should return the first result or the current hold. Inspect the hold schema and the checkout idempotency code as references. Add cases for a dropped response, simultaneous duplicate requests, a different payload using the same key, and a rolled-back first attempt. Reserve currently has no broker publish, so a message contract change would need a separate requirement.',
      controller, reserve(43, 118), migration('ticketing', 'V1__owned_schema', 262, 263, 'Hold uniqueness'),
      t('order/application/OrderService', 71, 92, 'Checkout idempotency'), ownerTest),
    status: 'inferred',
    prompt: 'Suppose retrying an identical reservation after a dropped response must never allocate a second ticket. Where would you put the rule, what would you persist, and which race would you test?',
  };

  const glossary = [
    ['Shopping session', 'Redis-backed permission for this buyer to shop for this concert, represented by a token and remaining lifetime.'],
    ['Ticket hold', 'Temporary quantity recorded for a buyer, concert and ticket type, with expiry and a session token.'],
    ['Purchase guard', 'PostgreSQL row locked for one buyer and concert during write operations that use it.'],
    ['Projection', 'A local copy shaped for a service’s reads. Ticketing uses its local copy of Catalog’s ticket-type configuration.'],
    ['TTL', 'Time to live. The remaining lifetime of the Redis session key, sampled in seconds here.'],
  ];

  const openQuestions = [
    confirmed('static-tests', 'The checked-in test source includes concurrent quota, expiration and stale-session release cases. These are source references.',
      ownerTest, cleanupTest),
    { id: 'runtime-unknown', status: 'unknown',
      summary: 'Live lock contention, deployed session settings, clock skew, and observed rollback under injected faults require a runtime investigation.',
      evidence: [] },
  ];

  return { revision: repoRevision, date: observedDate, story, steps, rules, failures, quiz, glossary, impact, openQuestions };
})();
