-- Mobile scanner demo data: one concert, one paid order and ten valid tickets.
--
-- STAFF login (seeded by V9):
--   email: staff@ticketbox.com
--   password: password123
--
-- Get all QR payloads after Flyway applies this migration:
--   SELECT
--       ROW_NUMBER() OVER (ORDER BY ticket.id) AS ticket_number,
--       ticket.id AS ticket_id,
--       ticket.qr_code
--   FROM tickets ticket
--   WHERE ticket.concert_id = '70000000-0000-0000-0000-000000000001'
--   ORDER BY ticket.id;

INSERT INTO concerts (
    id,
    title,
    description,
    artist_bio,
    venue_name,
    venue_address,
    event_date,
    doors_open_at,
    status,
    seat_map_svg,
    poster_url,
    created_by,
    created_at,
    updated_at
)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    'Mobile Scanner Demo - 10 Tickets',
    'Concert seeded only for the online and offline mobile check-in recording demo.',
    'TicketBox scanner demonstration concert.',
    'TicketBox Demo Arena',
    '1 Nguyen Hue, District 1, Ho Chi Minh City',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '7 days' - INTERVAL '2 hours',
    'ON_SALE',
    '<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="360" rx="24" fill="#101b2d"/><rect x="160" y="35" width="280" height="70" rx="12" fill="#287565"/><text x="300" y="78" text-anchor="middle" fill="white" font-size="22" font-family="Arial">DEMO STAGE</text><path d="M100 145H500L550 310H50Z" fill="#5ee0bf" fill-opacity=".28" stroke="#5ee0bf" stroke-width="3"/><text x="300" y="235" text-anchor="middle" fill="white" font-size="24" font-family="Arial">CHECK-IN ZONE</text></svg>',
    NULL,
    '00000000-0000-0000-0000-000000000001',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    venue_name = EXCLUDED.venue_name,
    venue_address = EXCLUDED.venue_address,
    event_date = EXCLUDED.event_date,
    doors_open_at = EXCLUDED.doors_open_at,
    status = EXCLUDED.status,
    seat_map_svg = EXCLUDED.seat_map_svg,
    updated_at = NOW();

INSERT INTO ticket_types (
    id,
    concert_id,
    name,
    price,
    total_quantity,
    available_qty,
    max_per_account,
    sale_start_at,
    sale_end_at,
    zone_color,
    is_active,
    created_at,
    updated_at
)
VALUES (
    '70000000-0000-0000-0000-000000000101',
    '70000000-0000-0000-0000-000000000001',
    'DEMO CHECK-IN',
    499000,
    10,
    0,
    10,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '6 days',
    '#287565',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    total_quantity = EXCLUDED.total_quantity,
    available_qty = EXCLUDED.available_qty,
    max_per_account = EXCLUDED.max_per_account,
    sale_start_at = EXCLUDED.sale_start_at,
    sale_end_at = EXCLUDED.sale_end_at,
    zone_color = EXCLUDED.zone_color,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO orders (
    id,
    user_id,
    concert_id,
    status,
    total_amount,
    idempotency_key,
    payment_provider,
    payment_ref,
    payment_url,
    paid_at,
    expires_at,
    created_at,
    updated_at
)
VALUES (
    '70000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    'PAID',
    4990000,
    'mobile-scanner-demo-order-10-tickets',
    'MOCK',
    'mobile-scanner-demo-payment',
    NULL,
    NOW() - INTERVAL '1 day',
    NULL,
    NOW() - INTERVAL '1 day',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    status = 'PAID',
    total_amount = EXCLUDED.total_amount,
    payment_provider = EXCLUDED.payment_provider,
    payment_ref = EXCLUDED.payment_ref,
    paid_at = EXCLUDED.paid_at,
    updated_at = NOW();

INSERT INTO order_items (
    id,
    order_id,
    ticket_type_id,
    quantity,
    unit_price,
    subtotal,
    created_at,
    updated_at
)
VALUES (
    '70000000-0000-0000-0000-000000000301',
    '70000000-0000-0000-0000-000000000201',
    '70000000-0000-0000-0000-000000000101',
    10,
    499000,
    4990000,
    NOW() - INTERVAL '1 day',
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    subtotal = EXCLUDED.subtotal,
    updated_at = NOW();

-- Each QR code is a valid HS256 JWT signed with the qr_secret in the same row.
-- All ten tickets start as VALID and therefore appear in the downloaded scanner dataset.
INSERT INTO tickets (
    id,
    order_item_id,
    ticket_type_id,
    concert_id,
    user_id,
    qr_code,
    qr_secret,
    status,
    issued_at,
    used_at,
    created_at,
    updated_at
)
VALUES
    ('70000000-0000-0000-0000-000000000401', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wMSIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.HIrQ2B1Da0hnsOhrGw5r9hdpEr1ACOV9wrEbGPGtU_E', '71000000-0000-0000-0000-000000000001', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000402', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wMiIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.Y7QELdJda3CVLLa4Ict1HYdaR4PRdhqRVEDo3Q9g_Fo', '71000000-0000-0000-0000-000000000002', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000403', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wMyIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.d2v5HHs2KWK6SdD8U9tpbgqrKJMKhqX1kbJtzD0M-Fc', '71000000-0000-0000-0000-000000000003', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000404', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wNCIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.F-fy0BQ7CHyHQ-zf_V8MO2k998nLEDVjlo27Gj-0oUw', '71000000-0000-0000-0000-000000000004', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000405', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wNSIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.ALf_iDnT6oPBMa9SZN7VCksjzN_FxcfYgmJ5fV7RA5A', '71000000-0000-0000-0000-000000000005', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000406', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wNiIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.g3RUAo4lvkBJsDRmwR2aqZ-eXVQYx_zSU7zBtB-Ok8k', '71000000-0000-0000-0000-000000000006', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000407', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wNyIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.ibDM_rKPP8THtx-ILrCApeUAd-x6sgsKawQq0RV-Je0', '71000000-0000-0000-0000-000000000007', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000408', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wOCIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.1iNqoIFNq1E2gqbr3CNDOMOd6JJtR4m4h4MUZ94NSh0', '71000000-0000-0000-0000-000000000008', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000409', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0wOSIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.hM0TaiWTfBqOk4zTgTu6ASe4egpVfhxkLYTP8ke4Y9o', '71000000-0000-0000-0000-000000000009', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW()),
    ('70000000-0000-0000-0000-000000000410', '70000000-0000-0000-0000-000000000301', '70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXRpY2tldC0xMCIsImNvbmNlcnRJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsInRpY2tldFR5cGVJZCI6IjcwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDEwMSIsInVzZXJJZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMyIsImlhdCI6MTc4MjI3MDAwMH0.7SG3_b7IrFnVHFsnNgRREUFC3E-DjKRbeRElBeld14I', '71000000-0000-0000-0000-000000000010', 'VALID', NOW() - INTERVAL '1 day', NULL, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    qr_code = EXCLUDED.qr_code,
    qr_secret = EXCLUDED.qr_secret,
    status = 'VALID',
    used_at = NULL,
    updated_at = NOW();
