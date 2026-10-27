INSERT INTO users (id, email, phone, full_name, password_hash, role, is_active, created_at, updated_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'organizer@ticketbox.com',
        '0123456789',
        'Mock Organizer',
        '$2a$10$BGQjnR9TTvLfmBhZdFPeve6Psag6ThMcuCVt70/890zQ.xiQfEAtm',
        'ORGANIZER',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'admin@ticketbox.com',
        '0123456789',
        'Mock Admin',
        '$2a$10$BGQjnR9TTvLfmBhZdFPeve6Psag6ThMcuCVt70/890zQ.xiQfEAtm',
        'ADMIN',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'audience@ticketbox.com',
        '0987654321',
        'Mock Audience',
        '$2a$10$BGQjnR9TTvLfmBhZdFPeve6Psag6ThMcuCVt70/890zQ.xiQfEAtm',
        'AUDIENCE',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'staff@ticketbox.com',
        '0900000004',
        'Mock Staff',
        '$2a$10$BGQjnR9TTvLfmBhZdFPeve6Psag6ThMcuCVt70/890zQ.xiQfEAtm',
        'STAFF',
        TRUE,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

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
    'Anh Trai Say Hi Live 2026',
    'Demo concert for the TicketBox order and mock payment flow.',
    'Anh Trai Say Hi brings a high-energy live show with multiple ticket zones for purchase testing.',
    'Quan Khu 7 Stadium',
    '202 Hoang Van Thu, Phu Nhuan District, Ho Chi Minh City',
    '2026-12-31 20:00:00+07',
    '2026-12-31 18:00:00+07',
    'ON_SALE',
    '<svg viewBox="0 0 600 420" xmlns="http://www.w3.org/2000/svg"><rect x="180" y="20" width="240" height="70" fill="#2563eb"/><text x="300" y="63" text-anchor="middle" fill="white" font-size="24" font-family="Arial">STAGE</text><rect x="95" y="125" width="190" height="95" fill="#dc2626"/><text x="190" y="180" text-anchor="middle" fill="white" font-size="20" font-family="Arial">SVIP</text><rect x="315" y="125" width="190" height="95" fill="#f97316"/><text x="410" y="180" text-anchor="middle" fill="white" font-size="20" font-family="Arial">VIP</text><rect x="95" y="250" width="190" height="95" fill="#16a34a"/><text x="190" y="305" text-anchor="middle" fill="white" font-size="20" font-family="Arial">CAT1</text><rect x="315" y="250" width="190" height="95" fill="#0891b2"/><text x="410" y="305" text-anchor="middle" fill="white" font-size="20" font-family="Arial">GA</text></svg>',
    'https://example.com/posters/anh-trai-say-hi-live-2026.jpg',
    '00000000-0000-0000-0000-000000000001',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    artist_bio = EXCLUDED.artist_bio,
    venue_name = EXCLUDED.venue_name,
    venue_address = EXCLUDED.venue_address,
    event_date = EXCLUDED.event_date,
    doors_open_at = EXCLUDED.doors_open_at,
    status = EXCLUDED.status,
    seat_map_svg = EXCLUDED.seat_map_svg,
    poster_url = EXCLUDED.poster_url,
    created_by = EXCLUDED.created_by,
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
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'SVIP',
        3500000,
        200,
        200,
        2,
        '2026-06-01 09:00:00+07',
        '2026-12-30 23:59:59+07',
        '#dc2626',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'VIP',
        2500000,
        500,
        500,
        4,
        '2026-06-01 09:00:00+07',
        '2026-12-30 23:59:59+07',
        '#f97316',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000001',
        'CAT1',
        1500000,
        1000,
        1000,
        4,
        '2026-06-01 09:00:00+07',
        '2026-12-30 23:59:59+07',
        '#16a34a',
        TRUE,
        NOW(),
        NOW()
    ),
    (
        '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000001',
        'GA',
        900000,
        3000,
        3000,
        6,
        '2026-06-01 09:00:00+07',
        '2026-12-30 23:59:59+07',
        '#0891b2',
        TRUE,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO UPDATE
SET concert_id = EXCLUDED.concert_id,
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
