// Schema snapshot from the six services' versioned Flyway migrations.
const schemaData = {
  catalog: {
    tables: [
      ["artist_pdf_jobs", "id", "V1__owned_schema", 3, 24, 85],
      ["catalog_availability", "ticket_type_id", "V3__sale_config_outbox", 7, 10, 8],
      ["concerts", "id", "V1__owned_schema", 26, 46, 88],
      ["event_publication", "id", "V1__owned_schema", 48, 55, 91],
      ["sale_config_outbox", "concert_id", "V3__sale_config_outbox", 1, 6, 2],
      ["shedlock", "name", "V1__owned_schema", 57, 62, 94],
      ["split_cutover_marker", "id", "V6__cutover_preflight", 2, 2, 2],
      ["split_seed_fingerprints", "table_name", "V6__cutover_preflight", 1, 1, 1],
      ["ticket_types", "id", "V1__owned_schema", 64, 80, 97],
    ],
    foreignKeys: [
      ["artist_pdf_jobs", "concert_id", "concerts", "id", "V1__owned_schema", 125],
      ["catalog_availability", "ticket_type_id", "ticket_types", "id", "V3__sale_config_outbox", 8],
      ["ticket_types", "concert_id", "concerts", "id", "V1__owned_schema", 128],
    ],
  },
  checkin: {
    tables: [
      ["admission_outbox", "ticket_id", "V9__admission_feedback", 1, 4, 2],
      ["batch_logs", "id", "V1__owned_schema", 3, 24, 159],
      ["checkin_logs", "id", "V1__owned_schema", 26, 39, 162],
      ["concerts", "id", "V1__owned_schema", 41, 61, 165],
      ["event_publication", "id", "V1__owned_schema", 63, 70, 168],
      ["guest_list_staging", "id", "V1__owned_schema", 72, 84, 171],
      ["guest_lists", "id", "V1__owned_schema", 95, 111, 174],
      ["projection_versions", "kind,id", "V3__projection_versions", 1, 6, 5],
      ["shedlock", "name", "V1__owned_schema", 113, 118, 177],
      ["split_cutover_marker", "id", "V6__cutover_preflight", 2, 2, 2],
      ["split_seed_fingerprints", "table_name", "V6__cutover_preflight", 1, 1, 1],
      ["ticket_types", "id", "V1__owned_schema", 120, 136, 180],
      ["tickets", "id", "V1__owned_schema", 140, 154, 183],
    ],
    foreignKeys: [
      ["admission_outbox", "ticket_id", "checkin_logs", "ticket_id", "V9__admission_feedback", 2],
      ["batch_logs", "concert_id", "concerts", "id", "V1__owned_schema", 253],
      ["checkin_logs", "concert_id", "concerts", "id", "V1__owned_schema", 256],
      ["checkin_logs", "ticket_id", "tickets", "id", "V1__owned_schema", 259],
      ["guest_list_staging", "batch_log_id", "batch_logs", "id", "V1__owned_schema", 262],
      ["guest_list_staging", "concert_id", "concerts", "id", "V1__owned_schema", 265],
      ["guest_lists", "concert_id", "concerts", "id", "V1__owned_schema", 268],
      ["ticket_types", "concert_id", "concerts", "id", "V1__owned_schema", 271],
      ["tickets", "concert_id", "concerts", "id", "V1__owned_schema", 274],
      ["tickets", "ticket_type_id", "ticket_types", "id", "V1__owned_schema", 277],
    ],
  },
  identity: {
    tables: [
      ["split_cutover_marker", "id", "V6__cutover_preflight", 2, 2, 2],
      ["split_seed_fingerprints", "table_name", "V6__cutover_preflight", 1, 1, 1],
      ["users", "id", "V1__owned_schema", 3, 14, 20],
    ],
    foreignKeys: [
    ],
  },
  notification: {
    tables: [
      ["notification_audit", "id", "V1__notification_ownership", 19, 22, 20],
      ["notification_inbox", "event_id", "V1__notification_ownership", 2, 5, 3],
      ["notifications", "id", "V1__notification_ownership", 6, 16, 7],
    ],
    foreignKeys: [
      ["notification_audit", "notification_id", "notifications", "id", "V1__notification_ownership", 20],
    ],
  },
  payment: {
    tables: [
      ["payment_attempts", "id", "V1__payment_ownership", 2, 11, 3],
      ["payment_audit", "id", "V1__payment_ownership", 18, 21, 19],
      ["payment_result_outbox", "event_id", "V1__payment_ownership", 13, 17, 14],
      ["refund_reviews", "request_id", "V1__payment_ownership", 22, 27, 23],
    ],
    foreignKeys: [
      ["payment_result_outbox", "intent_id", "payment_attempts", "intent_id", "V1__payment_ownership", 14],
      ["refund_reviews", "intent_id", "payment_attempts", "intent_id", "V1__payment_ownership", 23],
    ],
  },
  ticketing: {
    tables: [
      ["checkin_ticket_outbox", "ticket_id", "V4__ticket_publication", 1, 5, 2],
      ["concerts", "id", "V1__owned_schema", 3, 23, 200],
      ["event_publication", "id", "V1__owned_schema", 25, 32, 203],
      ["order_events", "order_id, stream_version", "V1__owned_schema", 34, 45, 206],
      ["order_items", "id", "V1__owned_schema", 47, 59, 209],
      ["orders", "id", "V1__owned_schema", 61, 78, 212],
      ["payment_cutover_control", "id", "V1__owned_schema", 80, 84, 215],
      ["projection_versions", "kind,id", "V3__projection_versions", 1, 6, 5],
      ["purchase_guards", "user_id, concert_id", "V1__owned_schema", 86, 89, 218],
      ["remote_reminder_dispatches", "event_id", "V1__owned_schema", 91, 94, 221],
      ["shedlock", "name", "V1__owned_schema", 96, 101, 224],
      ["split_cutover_marker", "id", "V6__cutover_preflight", 2, 2, 2],
      ["split_seed_fingerprints", "table_name", "V6__cutover_preflight", 1, 1, 1],
      ["ticket_holds", "id", "V1__owned_schema", 103, 114, 227],
      ["ticket_inventory", "ticket_type_id", "V1__owned_schema", 116, 125, 230],
      ["ticket_types", "id", "V1__owned_schema", 127, 143, 233],
      ["ticketing_payment_inbox", "event_id", "V1__owned_schema", 147, 153, 236],
      ["ticketing_payment_intents", "order_id", "V1__owned_schema", 155, 181, 242],
      ["tickets", "id", "V1__owned_schema", 183, 197, 248],
    ],
    foreignKeys: [
      ["checkin_ticket_outbox", "ticket_id", "tickets", "id", "V4__ticket_publication", 2],
      ["order_items", "order_id", "orders", "id", "V1__owned_schema", 320],
      ["order_items", "ticket_type_id", "ticket_types", "id", "V1__owned_schema", 323],
      ["orders", "concert_id", "concerts", "id", "V1__owned_schema", 326],
      ["purchase_guards", "concert_id", "concerts", "id", "V1__owned_schema", 329],
      ["ticket_inventory", "ticket_type_id", "ticket_types", "id", "V1__owned_schema", 332],
      ["ticket_types", "concert_id", "concerts", "id", "V1__owned_schema", 335],
      ["ticketing_payment_intents", "order_id", "orders", "id", "V1__owned_schema", 338],
      ["tickets", "concert_id", "concerts", "id", "V1__owned_schema", 341],
      ["tickets", "order_item_id", "order_items", "id", "V1__owned_schema", 344],
      ["tickets", "ticket_type_id", "ticket_types", "id", "V1__owned_schema", 347],
    ],
  },
};

// These joins and ID relationships are documented by application code.
const schemaCodeLinks = {
  ticketing: [
    ['ticket_holds', 'ticket_type_id', 'ticket_types', 'id',
      java('ticketing', 'inventory/hold/application/ReservationService', 59, 75, 'ReservationService resolves and validates the ticket type'),
      java('ticketing', 'inventory/hold/application/ReservationService', 102, 117, 'ReservationService saves the ticket type on the hold')],
    ['ticket_holds', 'concert_id', 'concerts', 'id',
      java('ticketing', 'inventory/hold/application/ReservationService', 59, 75, 'ReservationService validates concert membership'),
      java('ticketing', 'inventory/hold/application/ReservationService', 102, 117, 'ReservationService saves the concert on the hold')],
    ['order_events', 'order_id', 'orders', 'id',
      java('ticketing', 'order/infrastructure/OrderEventStore', 40, 52, 'OrderEventStore reads the stream by order ID'),
      java('ticketing', 'order/infrastructure/OrderEventStore', 88, 101, 'OrderEventStore appends by order ID')],
  ],
  catalog: [
    ['sale_config_outbox', 'concert_id', 'concerts', 'id',
      java('catalog', 'sales/infrastructure/CatalogPublisher', 85, 106, 'CatalogPublisher joins the outbox to its concert')],
  ],
};
