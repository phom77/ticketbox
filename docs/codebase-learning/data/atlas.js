const atlasData = (() => {
  const compose = (start, end, label) => source('compose.yaml', start, end, label);
  const gateway = (start, end, label) => source('infra/nginx/gateway.conf', start, end, label);
  const ticket = (file, start, end, symbol) => java('ticketing', file, start, end, symbol);
  const catalog = (file, start, end, symbol) => java('catalog', file, start, end, symbol);
  const checkin = (file, start, end, symbol) => java('checkin', file, start, end, symbol);
  const payment = (file, start, end, symbol) => java('payment', file, start, end, symbol);
  const notify = (file, start, end, symbol) => java('notification', file, start, end, symbol);
  const identity = (file, start, end, symbol) => java('identity', file, start, end, symbol);
  const schema = (service, start, end, symbol) => migration(service, 'V1__owned_schema', start, end, symbol);
  const node = (id, name, kind, capability, data, entry, summary, ...evidence) =>
    ({ ...confirmed(id, summary, ...evidence), name, kind, capability, data, entry });
  const edge = (id, from, to, transport, summary, ...evidence) =>
    ({ ...confirmed(id, summary, ...evidence), from, to, transport });
  const path = (id, title, summary, ...evidence) => ({ ...confirmed(id, summary, ...evidence), title });

  const momo = payment('infrastructure/provider/MomoPaymentGateway', 120, 131, 'MoMo create request');
  const vnpay = payment('infrastructure/provider/VnpayPaymentGateway', 177, 190, 'VNPAY query request');
  const bio = catalog('artistbio/infrastructure/OpenAiCompatibleArtistBioGenerator', 50, 64, 'Artist bio generation API');
  const poster = catalog('concert/infrastructure/CloudinaryPosterStorage', 36, 53, 'Cloudinary poster upload');
  const salePublisher = catalog('sales/infrastructure/CatalogPublisher', 108, 126, 'CatalogPublisher · POST and acknowledgment');
  const stockPull = catalog('sales/infrastructure/CatalogPublisher', 129, 149, 'CatalogPublisher · availability refresh');
  const hold = ticket('inventory/hold/web/ReservationController', 19, 40, 'ReservationController.reserve');
  const stockWrite = ticket('inventory/hold/application/ReservationService', 77, 117, 'ReservationService.reserve');
  const wait = ticket('queue/web/WaitingRoomController', 19, 43, 'WaitingRoomController');
  const paymentApi = payment('web/PaymentApi', 27, 55, 'PaymentApi · intents and provider callbacks');
  const scan = checkin('admission/web/StaffCheckinController', 22, 66, 'StaffCheckinController · scan and sync');
  const dataset = checkin('admission/web/StaffCheckinDatasetController', 49, 60, 'StaffCheckinDatasetController · download');
  const ticketPush = ticket('infrastructure/integration/checkin/TicketPublisher', 33, 57, 'TicketPublisher · scheduled delivery');
  const delivery = notify('application/DeliveryWorker', 25, 44, 'DeliveryWorker');
  const receiveCommand = notify('infrastructure/messaging/CommandConsumer', 22, 32, 'CommandConsumer');
  const auth = identity('auth/web/AuthController', 22, 44, 'AuthController');
  const browse = catalog('concert/web/ConcertController', 26, 87, 'ConcertController');
  const resultPush = payment('infrastructure/http/TicketingPaymentResults', 34, 43, 'TicketingPaymentResults.deliver');

  const inventory = [
    node('web', 'React web', 'Browser client', 'Audience, organizer and admin UI', 'Web assets are built into the gateway image.', 'Same-origin requests in the base deployment.',
      'The web app is a client shipped by the gateway image.', source('frontend/Dockerfile', 1, 12, 'React build and Nginx image'),
      source('frontend/src/api/client.ts', 45, 66, 'HTTP client interceptors')),
    node('scanner', 'Expo scanner', 'Staff client', 'Online and offline admission', 'Downloaded dataset and pending scans in native SQLite.', '/api/staff/concerts/…, /api/staff/checkins/…',
      'Staff can scan online, download a dataset or sync queued scans.',
      source('mobile-scanner/src/api/services/checkin.ts', 45, 65, 'Scanner API calls'),
      source('mobile-scanner/src/database/database.ts', 20, 50, 'Native dataset and scan tables'),
      source('mobile-scanner/src/api/client.ts', 27, 43, 'Staff request routing')),
    node('gateway', 'Nginx gateway', 'Edge process', 'Serve web assets and route API traffic', 'Built web assets.', '/, /api/, /ws/',
      'The base gateway serves the React app and routes public traffic to the owning service. Internal paths and actuator are blocked here.',
      compose(3, 16, 'Gateway container'), gateway(9, 50, 'Gateway locations')),
    node('identity', 'Identity', 'Java service', 'Accounts, authentication and roles', 'Own PostgreSQL · users.', '/api/auth, /api/users, /api/admin/users',
      'Issues sign-in credentials and exposes account and contact data.',
      auth, identity('account/web/AdminUserController', 20, 50, 'AdminUserController'), schema('identity', 3, 24, 'Users schema'), compose(168, 208, 'Identity and database')),
    node('catalog', 'Catalog', 'Java service', 'Concert discovery and sale setup', 'Own PostgreSQL · concerts, ticket_types, artist_pdf_jobs and availability projection.', '/api/concerts, /api/admin/ticket-types',
      'Owns sale configuration and supplies versioned snapshots to Ticketing and Check-in. Public browsing reads Catalog views.',
      browse, schema('catalog', 3, 46, 'Artist jobs and concerts'), schema('catalog', 64, 79, 'Ticket types'), compose(209, 253, 'Catalog and database')),
    node('ticketing', 'Ticketing', 'Java service', 'Waiting room, stock, orders and ticket issuance', 'Own PostgreSQL · ticket_holds, ticket_inventory, orders, tickets. Redis supports waiting-room and shopping-session state.', '/api/reservations, /api/orders, /api/tickets, /ws/',
      'Owns the stock write and the issued ticket. It keeps local Catalog data for purchase decisions and receives verified payment outcomes.',
      hold, wait, ticket('issuance/web/TicketController', 16, 45, 'Ticket API'),
      ticket('order/web/OrderController', 20, 36, 'Order API'), gateway(10, 17, 'WebSocket proxy'), schema('ticketing', 34, 126, 'Order history, guard, holds and inventory'),
      schema('ticketing', 147, 202, 'Payment and ticket tables'), compose(254, 298, 'Ticketing and database')),
    node('payment', 'Payment', 'Java service', 'Provider attempts and settlement', 'Own PostgreSQL · payment_attempts, payment_result_outbox, payment_audit, refund_reviews.', '/internal/intents, /api/payments/webhooks/{momo|vnpay}',
      'Starts provider attempts, handles callbacks and delivers verified results to Ticketing.',
      paymentApi, migration('payment', 'V1__payment_ownership', 2, 29, 'Payment ownership schema'), compose(17, 46, 'Payment container'), compose(75, 88, 'Payment database')),
    node('checkin', 'Check-in', 'Java service', 'Gate admission, offline sync and guest lists', 'Own PostgreSQL · checkin_logs, guest_lists and local ticket/catalog projections.', '/api/staff/concerts/…, /api/staff/checkins/…, /internal/split/tickets',
      'Decides admission from local data and sends admission feedback to Ticketing.',
      scan, dataset, schema('checkin', 26, 40, 'Admission log'), schema('checkin', 72, 112, 'Guest lists'), schema('checkin', 140, 155, 'Ticket projection'), compose(299, 343, 'Check-in and database')),
    node('notification', 'Notification', 'Java service', 'Confirmation, reminder and inbox delivery', 'Own PostgreSQL · notification_inbox, notifications, notification_audit.', '/api/notifications, RabbitMQ notification command consumer',
      'Accepts commands and resolves contact and document data for delivery.',
      receiveCommand, notify('web/NotificationApi', 40, 75, 'NotificationApi'),
      migration('notification', 'V1__notification_ownership', 2, 22, 'Notification ownership schema'), compose(47, 102, 'Notification container and database')),
    node('postgres', 'PostgreSQL', 'Six database processes', 'Service-owned persistence', 'One base Compose DB instance per current Java service.', 'Private service database connections.',
      'The Java services own their own PostgreSQL stores.',
      compose(75, 102, 'Payment and Notification stores'), compose(194, 208, 'Identity store'), compose(239, 253, 'Catalog store'), compose(284, 298, 'Ticketing store'), compose(329, 343, 'Check-in store')),
    node('redis', 'Redis', 'Infrastructure process', 'Shopping sessions and queue coordination', 'Ticketing session keys and their TTLs among other Redis state.', 'Private Redis connection.',
      'Ticketing validates a session token and reads its remaining TTL during a hold.',
      compose(103, 119, 'Redis container'), ticket('queue/application/WaitingRoomService', 302, 306, 'WaitingRoomService.validateAccess'),
      ticket('infrastructure/redis/RedisPurchaseSessions', 35, 38, 'RedisPurchaseSessions.remainingSeconds')),
    node('rabbit', 'RabbitMQ', 'Broker process', 'Notification command transport', 'Notification queue and exchange configured by application code.', 'Notification command exchange and routing.',
      'Ticketing publishes commands and Notification consumes them through the broker.',
      compose(120, 134, 'RabbitMQ container'), ticket('config/RabbitMqConfig', 19, 49, 'RabbitMqConfig'), receiveCommand),
    node('smtp', 'SMTP sink', 'Local infrastructure', 'Capture demo email', 'Local mail sink.', 'SMTP',
      'The base Compose topology points Notification at the local SMTP sink.',
      compose(61, 65, 'Notification SMTP wiring'), compose(135, 141, 'Local SMTP sink')),
    node('observability', 'Monitoring', 'Optional Compose profile', 'Metrics and dashboards', 'Prometheus and Grafana configuration.', 'Monitoring profile',
      'The base file defines optional monitoring components.', compose(142, 167, 'Monitoring profile')),
    node('provider', 'Payment providers', 'External systems', 'MoMo and VNPAY checkout', 'Provider-side payment records.', 'Provider requests and signed callbacks.',
      'Payment has adapters for MoMo and VNPAY. Local MOCK is a separate provider choice.', momo, vnpay, paymentApi,
      payment('infrastructure/provider/PaymentGatewayResolver', 22, 40, 'Provider resolution')),
    node('catalog-integrations', 'Catalog integrations', 'External systems', 'Artist bio generation and poster storage', 'External model service and image storage.', 'OpenAI-compatible API and Cloudinary uploader.',
      'Catalog contains an OpenAI-compatible biography generator and a Cloudinary poster adapter.', bio, poster),
  ];

  const api = (id, to, summary, ...evidence) => edge(id, 'gateway', to, 'HTTP reverse proxy', summary, ...evidence);
  const db = (id, from, start, end) => edge(id, from, 'postgres', 'Private database connection', `Base Compose gives ${inventory.find(item => item.id === from).name} its own database process.`,
    compose(start, end, 'Service and its database'));
  const edges = [
    edge('browser-gateway', 'web', 'gateway', 'Browser HTTP', 'Nginx serves the bundled web app and handles its same-origin API calls in the base deployment.',
      source('frontend/Dockerfile', 7, 12, 'Nginx image and built assets'), gateway(46, 50, 'API and SPA fallback')),
    { ...edge('scanner-gateway', 'scanner', 'gateway', 'Configured HTTP base', 'The scanner can reach the gateway when its ordinary API base points there. The actual device setting is environment-dependent.',
      source('mobile-scanner/src/api/client.ts', 27, 43, 'Scanner API base selection'), gateway(30, 33, 'Gateway staff routes')), status: 'inferred' },
    edge('scanner-direct', 'scanner', 'checkin', 'Optional direct HTTP', 'A configured Check-in base can route staff API calls directly.', source('mobile-scanner/src/api/client.ts', 27, 43, 'Staff API base selection')),
    api('identity-route', 'identity', '/api/auth, /api/users and admin user operations.', gateway(18, 21, 'Identity route')),
    api('notify-route', 'notification', 'Public and admin notification routes.', gateway(22, 25, 'Notification route')),
    api('payment-route', 'payment', 'Provider callbacks for MoMo and VNPAY.', gateway(26, 29, 'Payment webhook route'), paymentApi),
    api('checkin-route', 'checkin', 'Staff operations and selected organizer/admin check-in routes.', gateway(30, 33, 'Check-in route')),
    api('catalog-route', 'catalog', 'Concert browsing and selected organizer/admin sale-configuration routes.', gateway(42, 45, 'Catalog route')),
    edge('ticketing-route', 'gateway', 'ticketing', 'HTTP and WebSocket proxy', 'The /api/ fallback handles reservations and orders. /ws/ also routes to Ticketing.',
      gateway(10, 17, 'WebSocket proxy'), gateway(46, 49, 'API fallback'), hold),
    db('identity-db', 'identity', 168, 208), db('catalog-db', 'catalog', 209, 253),
    db('ticketing-db', 'ticketing', 254, 298), db('checkin-db', 'checkin', 299, 343),
    db('payment-db', 'payment', 17, 88), db('notification-db', 'notification', 47, 102),
    edge('sale-to-ticketing', 'catalog', 'ticketing', 'Versioned snapshot · HTTP POST', 'Catalog delivers sale data to /internal/split/catalog. Ticketing stores a local projection used by reserve.',
      salePublisher, ticket('web/internal/CatalogProjectionApi', 16, 19, 'Ticketing Catalog receiver')),
    edge('sale-to-checkin', 'catalog', 'checkin', 'Versioned snapshot · HTTP POST', 'Catalog sends Check-in a versioned snapshot at /internal/split/catalog.',
      salePublisher, checkin('web/internal/ProjectionApi', 9, 24, 'Check-in projection API')),
    edge('stock-poll', 'catalog', 'ticketing', 'Scheduled pull · HTTP GET', 'Catalog initiates /internal/split/stock and updates its local availability view with the response.',
      stockPull, ticket('inventory/web/StockApi', 17, 21, 'StockApi')),
    edge('ticket-push', 'ticketing', 'checkin', 'Scheduled outbox delivery · HTTP POST', 'Ticketing sends issued-ticket snapshots to /internal/split/tickets.',
      ticketPush, checkin('web/internal/ProjectionApi', 9, 24, 'Check-in projection API')),
    edge('admission-push', 'checkin', 'ticketing', 'Scheduled outbox delivery · HTTP POST', 'Check-in sends admissions to /internal/split/admissions.',
      checkin('infrastructure/integration/AdmissionPublisher', 25, 45, 'AdmissionPublisher'),
      ticket('web/internal/AdmissionProjectionApi', 16, 19, 'AdmissionProjectionApi')),
    edge('payment-intent', 'ticketing', 'payment', 'Synchronous internal HTTP', 'Ticketing creates and queries provider intents through Payment.',
      ticket('infrastructure/integration/payment/PaymentRemoteClient', 35, 72, 'PaymentRemoteClient'), paymentApi),
    edge('payment-result', 'payment', 'ticketing', 'Scheduled outbox delivery · HTTP POST', 'Payment delivers settlement results to /internal/ticketing/payment-results.',
      payment('application/PaymentSettlementService', 24, 31, 'Result delivery loop'), resultPush,
      ticket('web/internal/PaymentWorkflowController', 36, 43, 'PaymentWorkflowController')),
    edge('ticketing-contact', 'ticketing', 'identity', 'Synchronous internal HTTP', 'Ticketing looks up a contact via Identity’s internal user API.',
      ticket('infrastructure/integration/identity/IdentityContacts', 23, 33, 'IdentityContacts'), identity('web/internal/IdentityInternalApi', 15, 25, 'IdentityInternalApi')),
    edge('notification-command', 'ticketing', 'rabbit', 'Asynchronous broker publish', 'Ticketing publishes confirmation and reminder commands. A local PaymentCompletedEvent is part of the confirmation path.',
      ticket('infrastructure/integration/payment/PaymentCompletedListener', 18, 27, 'Local payment completion listener'),
      ticket('infrastructure/integration/notification/PaymentNotificationPublisher', 18, 40, 'PaymentNotificationPublisher'),
      ticket('infrastructure/integration/notification/RemoteReminderListener', 19, 25, 'RemoteReminderListener'),
      ticket('infrastructure/integration/notification/ConfirmedMessagePublisher', 16, 35, 'Rabbit publish with confirms')),
    edge('notification-consume', 'rabbit', 'notification', 'Asynchronous broker delivery', 'Notification consumes and accepts notification.commands.v1 messages.',
      ticket('config/RabbitMqConfig', 19, 49, 'Queue and binding'), receiveCommand),
    edge('notification-contact', 'notification', 'identity', 'Synchronous internal HTTP', 'In base Compose, Notification fetches contacts from Identity.',
      compose(57, 66, 'Notification owner URLs'), notify('infrastructure/http/CoreClient', 44, 63, 'Contact and document lookups')),
    edge('notification-document', 'notification', 'ticketing', 'Synchronous internal HTTP', 'Notification requests a Ticketing PDF when the delivery needs an attachment.',
      delivery, notify('infrastructure/http/CoreClient', 44, 63, 'Contact and document lookups'),
      ticket('web/internal/NotificationInternalController', 63, 73, 'Document endpoint')),
    edge('notification-email', 'notification', 'smtp', 'SMTP', 'The delivery worker hands email to the configured SMTP adapter.',
      delivery, notify('infrastructure/mail/SmtpNotificationMail', 19, 32, 'SMTP adapter'), compose(61, 65, 'SMTP wiring')),
    edge('provider-request', 'payment', 'provider', 'Provider HTTP when configured', 'The MoMo adapter sends a create request and the VNPAY adapter can query provider status.', momo, vnpay),
    edge('provider-callback', 'provider', 'gateway', 'Provider callback · HTTP', 'Configured providers can call the public MoMo/VNPAY webhook routes, which the gateway forwards to Payment.', paymentApi, gateway(26, 29, 'Provider webhook routes')),
    edge('catalog-external', 'catalog', 'catalog-integrations', 'External HTTP and SDK calls', 'Catalog can generate an artist biography via chat completions and upload a poster via the Cloudinary adapter.', bio, poster),
    edge('queue-redis', 'ticketing', 'redis', 'Synchronous Redis commands', 'Ticketing coordinates its waiting room and reads shopping-session state in Redis.',
      ticket('queue/application/WaitingRoomService', 287, 306, 'Admit and validate a shopping session'),
      ticket('infrastructure/redis/RedisPurchaseSessions', 35, 38, 'Session TTL')),
  ];

  const groups = {
    topology: [
      { title: 'Clients', nodes: ['web', 'scanner'] },
      { title: 'Public edge', connector: 'Browser HTTP · scanner uses a configured base', nodes: ['gateway'] },
      { title: 'Current backend', connector: 'Gateway routes HTTP and WebSocket traffic by path', nodes: ['identity', 'catalog', 'ticketing', 'payment', 'checkin', 'notification'] },
      { title: 'Data and delivery infrastructure', connector: 'Service-specific connections · inspect a node for exact links', nodes: ['postgres', 'redis', 'rabbit', 'smtp'] },
      { title: 'External integrations', nodes: ['provider', 'catalog-integrations'] },
      { title: 'Optional and separate deployments', nodes: ['observability'] },
    ],
    capabilities: [
      { title: 'Set up a sale', nodes: ['identity', 'catalog'] },
      { title: 'Sell and settle', nodes: ['ticketing', 'payment'] },
      { title: 'Deliver tickets and admit people', nodes: ['notification', 'checkin'] },
    ],
    relationships: [
      { title: 'Public request entry', nodes: ['web', 'scanner', 'gateway'] },
      { title: 'Service-to-service APIs and publications', nodes: ['identity', 'catalog', 'ticketing', 'payment', 'checkin', 'notification'] },
      { title: 'State and transport', nodes: ['postgres', 'redis', 'rabbit', 'smtp'] },
      { title: 'External integrations', nodes: ['provider', 'catalog-integrations'] },
    ],
  };

  const roadmap = [
    { ...path('learn-reserve', 'Reserve a ticket', 'Follow one admitted shopper’s click into Ticketing. Study how session checks, per-account quota and stock produce a temporary hold.', hold, stockWrite),
      lesson: 'flows/reserve-ticket.html' },
    path('learn-order', 'Turn a cart into an order', 'Follow checkout idempotency, the stock delta and the conversion of matching holds into an AWAITING_PAYMENT order.',
      ticket('order/web/OrderController', 20, 36, 'OrderController.create'), ticket('order/application/OrderService', 71, 92, 'Checkout idempotency'), ticket('order/application/OrderService', 204, 268, 'Stock delta, holds and order write')),
    path('learn-payment', 'Settle payment and issue tickets', 'Trace the provider intent, asynchronous result delivery and Ticketing’s PAID transition and issuance.',
      paymentApi, resultPush, ticket('order/application/OrderService', 722, 788, 'Paid transition and ticket creation')),
    path('learn-gate', 'Scan a ticket at the venue', 'Trace issued-ticket snapshots, online admission or offline sync, and feedback to Ticketing.',
      ticketPush, scan, dataset, checkin('admission/application/CheckinService', 108, 143, 'Local admission transaction'),
      checkin('infrastructure/integration/AdmissionPublisher', 25, 45, 'Admission feedback')),
    path('learn-sale', 'Configure and publish a concert sale', 'Follow organizer changes into Catalog’s versioned delivery and public concert browsing.',
      catalog('concert/web/OrganizerConcertController', 58, 93, 'Organizer concert changes'),
      catalog('sales/web/OrganizerTicketTypeController', 45, 75, 'Organizer ticket-type changes'), salePublisher, browse),
    path('learn-waiting-room', 'Enter the waiting room and get admitted', 'Follow queue entry and the Redis-backed handoff to a shopping session.', wait,
      ticket('queue/application/WaitingRoomService', 116, 138, 'Queue join'),
      ticket('queue/application/WaitingRoomService', 287, 306, 'Admission and access check')),
    path('learn-delivery', 'Deliver a confirmation or reminder', 'Follow the broker command through the Notification inbox and delivery worker.',
      ticket('infrastructure/integration/notification/PaymentNotificationPublisher', 18, 40, 'Confirmation command'),
      ticket('infrastructure/integration/notification/RemoteReminderListener', 19, 25, 'Reminder command'), receiveCommand, delivery),
  ];

  const scope = [
    confirmed('baseline', 'The base deployment has six Java service modules. Optional monitoring and lab replicas have separate configuration scopes.',
      source('pom.xml', 1, 4, 'Root Maven reactor'), compose(142, 167, 'Optional monitoring'),
      source('compose.lab.yaml', 33, 69, 'Lab replicas')),
    { id: 'glossary-scope', status: 'docs-only', summary: 'The repository glossary names six business contexts. Use the deployment map separately when asking which processes or databases are involved.',
      evidence: [source('GLOSSARY-MAP.md', 3, 18, 'Business contexts and relationships')] },
    { id: 'scanner-doc-conflict', status: 'docs-only', summary: 'The scanner guide’s offline section still says online scans consume tickets in Core. The current split gateway routes staff requests to Check-in, and the scanner supports a direct Check-in base.',
      evidence: [source('mobile-scanner/README.md', 27, 40, 'Offline guide and venue configuration'),
        gateway(30, 33, 'Staff route'), scan] },
    { id: 'runtime-scope', status: 'unknown', summary: 'Deployed overrides, current queue depth, delivery lag, and live traces were outside this source review.', evidence: [] },
  ];
  return { revision: repoRevision, date: observedDate, inventory, edges, groups, roadmap, scope };
})();
