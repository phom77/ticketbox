-- Expand the public demo catalog to 20 concerts in total.
-- V9 already provides concert 0001 (Anh Trai Say Hi Live 2026).

UPDATE concerts
SET poster_url = 'https://t.cmx-cdn.com/amnhac.net/files/chinguyen/2024/08/27/concert-anh-trai-say-hi-o-dau-ngay-may-gia-ve-bao-nhieu-094524.jpg',
    updated_at = NOW()
WHERE id = '10000000-0000-0000-0000-000000000001';

WITH concert_seed (
    seed_no,
    title,
    description,
    artist_bio,
    venue_name,
    venue_address,
    event_date,
    doors_open_at,
    status,
    poster_url,
    base_price
) AS (
    VALUES
        (2, 'Anh Trai Vượt Ngàn Chông Gai Live 2026', 'A large-scale live reunion with powerful vocals, band performances, and cinematic staging.', 'Anh Trai Vượt Ngàn Chông Gai celebrates resilience, friendship, and the creative journeys of established Vietnamese performers.', 'My Dinh National Stadium', 'Le Duc Tho, Nam Tu Liem, Hanoi', '2026-08-15 20:00:00+07'::timestamptz, '2026-08-15 18:00:00+07'::timestamptz, 'ON_SALE', 'https://content-media.pamedia.io/press-release/picture/2025/03/13/01JP7RFR823PR0XMQGNEYN4X0P.jpg', 1200000::numeric),
        (3, 'Em Xinh Say Hi Live 2026', 'A bright, fashion-forward pop concert filled with collaborative stages and new-generation energy.', 'Em Xinh Say Hi brings together emerging female voices for colorful performances, original arrangements, and audience-first moments.', 'SECC Outdoor Stage', '799 Nguyen Van Linh, District 7, Ho Chi Minh City', '2026-09-05 19:30:00+07'::timestamptz, '2026-09-05 17:30:00+07'::timestamptz, 'ON_SALE', 'https://image.ngaynay.vn/w890/Uploaded/2026/ycgvppwi/2025_10_12/img-9040-1738-9587.jpg', 950000::numeric),
        (4, 'Chị Đẹp Đạp Gió Rẽ Sóng Live 2026', 'An empowering live production blending music, dance, storytelling, and striking visual direction.', 'The artists of Chị Đẹp Đạp Gió Rẽ Sóng share a stage built around confidence, reinvention, and unforgettable group performances.', 'Quan Khu 7 Stadium', '202 Hoang Van Thu, Phu Nhuan District, Ho Chi Minh City', '2026-09-26 20:00:00+07'::timestamptz, '2026-09-26 18:00:00+07'::timestamptz, 'ON_SALE', 'https://media.yeah1.com/files/trongtin/2025/04/13/th_03867-124643.jpg', 1100000::numeric),
        (5, 'Hanoi Indie Night', 'A one-night gathering of independent bands, intimate songwriting, and atmospheric production.', 'A curated lineup from Vietnam''s indie scene brings guitar-driven stories and close audience connection to Hanoi.', 'Dong Kinh Nghia Thuc Square', 'Hoan Kiem District, Hanoi', '2026-10-10 19:00:00+07'::timestamptz, '2026-10-10 17:30:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1800&q=85', 550000::numeric),
        (6, 'Saigon Electronic Weekender', 'Two nights of electronic music, immersive lighting, and late-night city energy.', 'Regional DJs and live electronic acts transform the riverside into a kinetic audiovisual playground.', 'Saigon Riverside Park', 'Thu Duc City, Ho Chi Minh City', '2026-10-24 18:00:00+07'::timestamptz, '2026-10-24 16:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1800&q=85', 800000::numeric),
        (7, 'Da Nang Ocean Sound', 'A seaside music festival pairing contemporary Vietnamese acts with sunset performances.', 'Ocean Sound combines coastal scenery, modern pop, and relaxed festival culture on the Da Nang waterfront.', 'East Sea Park', 'Vo Nguyen Giap, Son Tra, Da Nang', '2026-11-07 17:00:00+07'::timestamptz, '2026-11-07 15:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1800&q=85', 700000::numeric),
        (8, 'Mekong Acoustic Stories', 'An intimate evening of acoustic music inspired by southern landscapes and everyday stories.', 'Singer-songwriters from across Vietnam perform stripped-back sets beside the Mekong River.', 'Can Tho River Park', 'Ninh Kieu District, Can Tho', '2026-11-21 19:00:00+07'::timestamptz, '2026-11-21 17:30:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1800&q=85', 450000::numeric),
        (9, 'Hue Imperial Soundscape', 'Traditional instruments meet contemporary composition in a dramatic heritage setting.', 'A cross-generational ensemble reimagines the musical identity of Hue through light, movement, and live orchestration.', 'Ngo Mon Square', 'Hue Imperial City, Hue', '2026-12-05 19:30:00+07'::timestamptz, '2026-12-05 18:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1468359601543-843bfaef291a?auto=format&fit=crop&w=1800&q=85', 650000::numeric),
        (10, 'Vietnam Hip Hop Festival', 'A full-day celebration of rap, dance crews, beatmakers, and street culture.', 'Leading and emerging Vietnamese hip-hop artists share a festival stage designed for cyphers, battles, and headline sets.', 'Gia Dinh Park', 'Go Vap District, Ho Chi Minh City', '2026-12-19 15:00:00+07'::timestamptz, '2026-12-19 13:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1524650359799-842906ca1c06?auto=format&fit=crop&w=1800&q=85', 750000::numeric),
        (11, 'New Year Countdown Hanoi 2027', 'A city-center countdown featuring live artists, visual projections, and a midnight celebration.', 'Vietnamese pop performers and DJs welcome the new year with a large public production in the heart of Hanoi.', 'August Revolution Square', 'Hoan Kiem District, Hanoi', '2026-12-31 20:00:00+07'::timestamptz, '2026-12-31 18:00:00+07'::timestamptz, 'SOLD_OUT', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=85', 900000::numeric),
        (12, 'Spring Bloom Music Festival', 'A joyful spring festival with pop, folk-inspired stages, food, and outdoor experiences.', 'Spring Bloom welcomes the new season through contemporary Vietnamese music and colorful cultural collaborations.', 'Yen So Park', 'Hoang Mai District, Hanoi', '2027-02-20 16:00:00+07'::timestamptz, '2027-02-20 14:00:00+07'::timestamptz, 'DRAFT', 'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1800&q=85', 600000::numeric),
        (13, 'Women in Music Vietnam', 'A showcase of women shaping Vietnam''s current music landscape across genres and generations.', 'Vocalists, producers, instrumentalists, and songwriters lead an evening centered on artistry and creative independence.', 'Hoa Binh Theater', 'District 10, Ho Chi Minh City', '2027-03-13 19:30:00+07'::timestamptz, '2027-03-13 18:00:00+07'::timestamptz, 'CANCELLED', 'https://images.unsplash.com/photo-1488841714725-bb4c32d1ac94?auto=format&fit=crop&w=1800&q=85', 850000::numeric),
        (14, 'Rock the Red River', 'A loud, guitar-driven festival bringing together alternative and rock bands from across Vietnam.', 'Rock the Red River is built for live-band energy, festival crowds, and a stage that gets heavier after sunset.', 'Long Bien Riverside', 'Long Bien District, Hanoi', '2027-04-03 17:00:00+07'::timestamptz, '2027-04-03 15:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1501612780327-45045538702b?auto=format&fit=crop&w=1800&q=85', 700000::numeric),
        (15, 'Jazz by the River', 'An elegant riverside evening of jazz ensembles, vocal standards, and modern improvisation.', 'Vietnamese jazz musicians and international guests share a relaxed open-air program beside the Saigon River.', 'Bach Dang Wharf Park', 'District 1, Ho Chi Minh City', '2027-04-24 18:30:00+07'::timestamptz, '2027-04-24 17:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=1800&q=85', 800000::numeric),
        (16, 'Nha Trang Summer Waves', 'A beachside summer concert combining pop anthems, dance music, and ocean views.', 'Summer Waves turns the Nha Trang coast into a vibrant live stage for holiday crowds and music fans.', 'April 2 Square', 'Tran Phu, Nha Trang', '2027-05-15 17:30:00+07'::timestamptz, '2027-05-15 15:30:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1509824227185-9c5a01ceba0d?auto=format&fit=crop&w=1800&q=85', 650000::numeric),
        (17, 'Campus Sound 2027', 'A high-energy youth festival featuring university bands, rising artists, and creative showcases.', 'Campus Sound gives student communities and emerging performers a major live platform in Ho Chi Minh City.', 'Vietnam National University Urban Area', 'Thu Duc City, Ho Chi Minh City', '2027-06-05 16:00:00+07'::timestamptz, '2027-06-05 14:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1800&q=85', 350000::numeric),
        (18, 'Vietnam Symphony Under the Stars', 'A cinematic outdoor symphony program featuring familiar themes and Vietnamese compositions.', 'A full orchestra performs beneath the night sky with projection design and guest soloists.', 'Thang Long Imperial Citadel', 'Ba Dinh District, Hanoi', '2027-06-26 19:30:00+07'::timestamptz, '2027-06-26 18:00:00+07'::timestamptz, 'SOLD_OUT', 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1800&q=85', 1000000::numeric),
        (19, 'Hoi An Lantern Sessions', 'A warm acoustic concert framed by lantern light, heritage architecture, and intimate performances.', 'Lantern Sessions invites artists to reinterpret beloved songs in a calm, story-led setting.', 'An Hoi Sculpture Garden', 'Hoi An, Quang Nam', '2027-07-17 19:00:00+07'::timestamptz, '2027-07-17 17:30:00+07'::timestamptz, 'DRAFT', 'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1800&q=85', 550000::numeric),
        (20, 'TicketBox City Lights Festival', 'A flagship multi-stage festival connecting pop, indie, electronic, and visual arts.', 'City Lights closes the demo season with a broad lineup and the full TicketBox festival experience.', 'The Global City', 'Thu Duc City, Ho Chi Minh City', '2027-08-07 15:00:00+07'::timestamptz, '2027-08-07 13:00:00+07'::timestamptz, 'ON_SALE', 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1800&q=85', 850000::numeric)
)
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
SELECT
    ('10000000-0000-0000-0000-' || lpad(seed_no::text, 12, '0'))::uuid,
    title,
    description,
    artist_bio,
    venue_name,
    venue_address,
    event_date,
    doors_open_at,
    status,
    format(
        '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="%s ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="%s" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="%s" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="%s" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>',
        title,
        ('21000000-0000-0000-' || lpad(seed_no::text, 4, '0') || '-000000000001'),
        ('21000000-0000-0000-' || lpad(seed_no::text, 4, '0') || '-000000000002'),
        ('21000000-0000-0000-' || lpad(seed_no::text, 4, '0') || '-000000000003')
    ),
    poster_url,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW(),
    NOW()
FROM concert_seed
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
    updated_at = NOW();

WITH concert_seed (seed_no, event_date, status, base_price) AS (
    VALUES
        (2, '2026-08-15 20:00:00+07'::timestamptz, 'ON_SALE', 1200000::numeric),
        (3, '2026-09-05 19:30:00+07'::timestamptz, 'ON_SALE', 950000::numeric),
        (4, '2026-09-26 20:00:00+07'::timestamptz, 'ON_SALE', 1100000::numeric),
        (5, '2026-10-10 19:00:00+07'::timestamptz, 'ON_SALE', 550000::numeric),
        (6, '2026-10-24 18:00:00+07'::timestamptz, 'ON_SALE', 800000::numeric),
        (7, '2026-11-07 17:00:00+07'::timestamptz, 'ON_SALE', 700000::numeric),
        (8, '2026-11-21 19:00:00+07'::timestamptz, 'ON_SALE', 450000::numeric),
        (9, '2026-12-05 19:30:00+07'::timestamptz, 'ON_SALE', 650000::numeric),
        (10, '2026-12-19 15:00:00+07'::timestamptz, 'ON_SALE', 750000::numeric),
        (11, '2026-12-31 20:00:00+07'::timestamptz, 'SOLD_OUT', 900000::numeric),
        (12, '2027-02-20 16:00:00+07'::timestamptz, 'DRAFT', 600000::numeric),
        (13, '2027-03-13 19:30:00+07'::timestamptz, 'CANCELLED', 850000::numeric),
        (14, '2027-04-03 17:00:00+07'::timestamptz, 'ON_SALE', 700000::numeric),
        (15, '2027-04-24 18:30:00+07'::timestamptz, 'ON_SALE', 800000::numeric),
        (16, '2027-05-15 17:30:00+07'::timestamptz, 'ON_SALE', 650000::numeric),
        (17, '2027-06-05 16:00:00+07'::timestamptz, 'ON_SALE', 350000::numeric),
        (18, '2027-06-26 19:30:00+07'::timestamptz, 'SOLD_OUT', 1000000::numeric),
        (19, '2027-07-17 19:00:00+07'::timestamptz, 'DRAFT', 550000::numeric),
        (20, '2027-08-07 15:00:00+07'::timestamptz, 'ON_SALE', 850000::numeric)
),
zone_seed (zone_no, name, price_multiplier, total_quantity, max_per_account, zone_color) AS (
    VALUES
        (1, 'VIP', 2.00::numeric, 250, 2, '#e11d48'),
        (2, 'STANDARD', 1.25::numeric, 800, 4, '#8f7aff'),
        (3, 'GA', 1.00::numeric, 2000, 6, '#0891b2')
)
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
SELECT
    ('21000000-0000-0000-' || lpad(c.seed_no::text, 4, '0') || '-' || lpad(z.zone_no::text, 12, '0'))::uuid,
    ('10000000-0000-0000-0000-' || lpad(c.seed_no::text, 12, '0'))::uuid,
    z.name,
    round(c.base_price * z.price_multiplier),
    z.total_quantity,
    CASE
        WHEN c.status IN ('SOLD_OUT', 'CANCELLED') THEN 0
        WHEN c.status = 'DRAFT' THEN z.total_quantity
        ELSE greatest(1, floor(z.total_quantity * (0.42 + (c.seed_no % 4) * 0.12))::integer)
    END,
    z.max_per_account,
    c.event_date - interval '60 days',
    c.event_date - interval '2 hours',
    z.zone_color,
    c.status <> 'CANCELLED',
    NOW(),
    NOW()
FROM concert_seed c
CROSS JOIN zone_seed z
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
