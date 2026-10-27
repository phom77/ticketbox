-- Staff scanner demo data
--
-- Staff login:
--   email: staff@ticketbox.com
--   password before hash: staff123
--
-- Scanner test concert:
--   concertId: 10000000-0000-0000-0000-000000000001
--   gate suggestion: A

INSERT INTO users (id, email, phone, full_name, password_hash, role, is_active, created_at, updated_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000004',
        'staff@ticketbox.com',
        '0123456789',
        'Mock Staff',
        '$2a$10$3cOV6FI/SrBdqFoD/8jPBebVmhE7oobTAaCfOJXTpfykK/HvOnxI2',
        'STAFF',
        TRUE,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

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
    '10000000-0000-0000-0000-000000000001',
    'Staff Scanner Demo Concert',
    'Demo concert seeded for mobile scanner dataset, offline check-in, online scan, and batch sync tests.',
    'Seed artist for scanner testing.',
    'TicketBox Demo Arena',
    '1 Demo Street, Ho Chi Minh City',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '7 days' - INTERVAL '2 hours',
    'ON_SALE',
    '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#287565"/></svg>',
    NULL,
    '00000000-0000-0000-0000-000000000001',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

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
    '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    'STAFF_TEST_ZONE',
    0,
    3,
    0,
    4,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '6 days',
    '#287565',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

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
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'PAID',
    0,
    'seed-staff-scanner-order',
    'MOCK',
    'seed-staff-scanner-payment',
    NULL,
    NOW() - INTERVAL '1 day',
    NULL,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

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
    '10000000-0000-0000-0000-000000000301',
    '10000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000101',
    3,
    0,
    0,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- VALID_A: use for offline local check-in, then Sync Now. Expected sync result: ACCEPTED.
-- VALID_B: use while Online. Expected online scan result: SUCCESS / Check-in successful.
-- USED_C: use while Online. Expected online scan result: FAILED / Ticket is not valid for check-in.
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
    (
        '10000000-0000-0000-0000-000000000401',
        '10000000-0000-0000-0000-000000000301',
        '10000000-0000-0000-0000-000000000101',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ2YWxpZF9hIiwiY29uY2VydElkIjoiMTAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwidGlja2V0VHlwZUlkIjoiMTAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMTAxIiwidXNlcklkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAzIiwiaWF0IjoxNzgxNTcxNjAwfQ.BjTRZkYS27gi2NNlFvWQ-Xt79zzQ26UD9lK8HHovX04',
        'staff-test-secret-valid-a-1234567890',
        'VALID',
        NOW() - INTERVAL '1 day',
        NULL,
        NOW(),
        NOW()
    ),
    (
        '10000000-0000-0000-0000-000000000402',
        '10000000-0000-0000-0000-000000000301',
        '10000000-0000-0000-0000-000000000101',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ2YWxpZF9iIiwiY29uY2VydElkIjoiMTAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwidGlja2V0VHlwZUlkIjoiMTAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMTAxIiwidXNlcklkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAzIiwiaWF0IjoxNzgxNTcxNjAwfQ.GjBPlXL4IaqrOzpUQwBRCPEbjZo8vs-rNiIrwZW65x0',
        'staff-test-secret-valid-b-1234567890',
        'VALID',
        NOW() - INTERVAL '1 day',
        NULL,
        NOW(),
        NOW()
    ),
    (
        '10000000-0000-0000-0000-000000000403',
        '10000000-0000-0000-0000-000000000301',
        '10000000-0000-0000-0000-000000000101',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VkX2MiLCJjb25jZXJ0SWQiOiIxMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJ0aWNrZXRUeXBlSWQiOiIxMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAxMDEiLCJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDMiLCJpYXQiOjE3ODE1NzE2MDB9.hxGMypc7QQGozLU1CLBp2oFk9tm9mmcMLQffouVessM',
        'staff-test-secret-used-c-12345678901',
        'USED',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 hour',
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;
