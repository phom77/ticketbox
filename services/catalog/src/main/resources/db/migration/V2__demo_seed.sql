--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: concerts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('70000000-0000-0000-0000-000000000001', 'Mobile Scanner Demo - 10 Tickets', 'Concert seeded only for the online and offline mobile check-in recording demo.', 'TicketBox scanner demonstration concert.', 'TicketBox Demo Arena', '1 Nguyen Hue, District 1, Ho Chi Minh City', '2026-11-11 11:07:38.972624+00', '2026-11-11 09:07:38.972624+00', '2026-11-03 11:07:38.972624+00', '2026-11-10 11:07:38.972624+00', 'ON_SALE', '<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="360" rx="24" fill="#101b2d"/><rect x="160" y="35" width="280" height="70" rx="12" fill="#287565"/><text x="300" y="78" text-anchor="middle" fill="white" font-size="22" font-family="Arial">DEMO STAGE</text><path d="M100 145H500L550 310H50Z" fill="#5ee0bf" fill-opacity=".28" stroke="#5ee0bf" stroke-width="3"/><text x="300" y="235" text-anchor="middle" fill="white" font-size="24" font-family="Arial">CHECK-IN ZONE</text></svg>', NULL, '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:38.972624+00', '2026-11-04 11:07:39.203097+00', NULL, false);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000001', 'Anh Trai Say Hi Live 2026', 'A high-energy stadium production bringing together live music, choreography, immersive visuals, and thousands of fans for one unforgettable night in Ho Chi Minh City.', 'Anh Trai Say Hi is a contemporary Vietnamese music project that brings a new generation of performers together through original stages, collaboration, and live audience energy. The concert expands that spirit into a full-scale stadium experience, pairing fan-favorite songs with exclusive arrangements and cinematic production.', 'Quan Khu 7 Stadium', '202 Hoang Van Thu, Phu Nhuan District, Ho Chi Minh City', '2026-12-31 13:00:00+00', '2026-12-31 11:00:00+00', '2026-06-01 02:00:00+00', '2026-12-30 16:59:59+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anh Trai Say Hi ticket zone map">
      <defs>
        <linearGradient id="stageGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff765f" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#ff765f" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <rect width="720" height="520" rx="20" fill="#0e0e11"/>
      <g id="stage">
        <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="url(#stageGlow)" stroke="#ff765f" stroke-width="2"/>
        <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
      </g>
      <g data-ticket-type-id="20000000-0000-0000-0000-000000000001" data-zone-name="SVIP" tabindex="0" role="button" aria-label="Select SVIP ticket zone">
        <path d="M210 130 H510 L540 220 H180 Z" fill="#dc2626" fill-opacity="0.34" stroke="#dc2626" stroke-width="2"/>
        <text x="360" y="180" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">SVIP</text>
      </g>
      <g data-ticket-type-id="20000000-0000-0000-0000-000000000002" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
        <path d="M150 240 H570 L610 330 H110 Z" fill="#f97316" fill-opacity="0.3" stroke="#f97316" stroke-width="2"/>
        <text x="360" y="292" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">VIP</text>
      </g>
      <g data-ticket-type-id="20000000-0000-0000-0000-000000000003" data-zone-name="CAT1" tabindex="0" role="button" aria-label="Select CAT1 ticket zone">
        <path d="M82 350 H638 L670 420 H50 Z" fill="#16a34a" fill-opacity="0.28" stroke="#16a34a" stroke-width="2"/>
        <text x="360" y="392" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">CAT1</text>
      </g>
      <g data-ticket-type-id="20000000-0000-0000-0000-000000000004" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
        <path d="M32 438 H688 L704 488 H16 Z" fill="#0891b2" fill-opacity="0.26" stroke="#0891b2" stroke-width="2"/>
        <text x="360" y="471" text-anchor="middle" fill="white" font-size="18" font-weight="700" font-family="Arial">GA</text>
      </g>
    </svg>', 'https://t.cmx-cdn.com/amnhac.net/files/chinguyen/2024/08/27/concert-anh-trai-say-hi-o-dau-ngay-may-gia-ve-bao-nhieu-094524.jpg', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:38.519475+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000002', 'Anh Trai Vượt Ngàn Chông Gai Live 2026', 'A large-scale live reunion with powerful vocals, band performances, and cinematic staging.', 'Anh Trai Vượt Ngàn Chông Gai celebrates resilience, friendship, and the creative journeys of established Vietnamese performers.', 'My Dinh National Stadium', 'Le Duc Tho, Nam Tu Liem, Hanoi', '2026-08-15 13:00:00+00', '2026-08-15 11:00:00+00', '2026-06-16 13:00:00+00', '2026-08-15 11:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anh Trai Vượt Ngàn Chông Gai Live 2026 ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0002-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0002-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0002-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://content-media.pamedia.io/press-release/picture/2025/03/13/01JP7RFR823PR0XMQGNEYN4X0P.jpg', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000003', 'Em Xinh Say Hi Live 2026', 'A bright, fashion-forward pop concert filled with collaborative stages and new-generation energy.', 'Em Xinh Say Hi brings together emerging female voices for colorful performances, original arrangements, and audience-first moments.', 'SECC Outdoor Stage', '799 Nguyen Van Linh, District 7, Ho Chi Minh City', '2026-09-05 12:30:00+00', '2026-09-05 10:30:00+00', '2026-07-07 12:30:00+00', '2026-09-05 10:30:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Em Xinh Say Hi Live 2026 ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0003-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0003-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0003-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://image.ngaynay.vn/w890/Uploaded/2026/ycgvppwi/2025_10_12/img-9040-1738-9587.jpg', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000004', 'Chị Đẹp Đạp Gió Rẽ Sóng Live 2026', 'An empowering live production blending music, dance, storytelling, and striking visual direction.', 'The artists of Chị Đẹp Đạp Gió Rẽ Sóng share a stage built around confidence, reinvention, and unforgettable group performances.', 'Quan Khu 7 Stadium', '202 Hoang Van Thu, Phu Nhuan District, Ho Chi Minh City', '2026-09-26 13:00:00+00', '2026-09-26 11:00:00+00', '2026-07-28 13:00:00+00', '2026-09-26 11:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chị Đẹp Đạp Gió Rẽ Sóng Live 2026 ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0004-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0004-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0004-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://media.yeah1.com/files/trongtin/2025/04/13/th_03867-124643.jpg', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000005', 'Hanoi Indie Night', 'A one-night gathering of independent bands, intimate songwriting, and atmospheric production.', 'A curated lineup from Vietnam''s indie scene brings guitar-driven stories and close audience connection to Hanoi.', 'Dong Kinh Nghia Thuc Square', 'Hoan Kiem District, Hanoi', '2026-10-10 12:00:00+00', '2026-10-10 10:30:00+00', '2026-08-11 12:00:00+00', '2026-10-10 10:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hanoi Indie Night ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0005-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0005-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0005-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000006', 'Saigon Electronic Weekender', 'Two nights of electronic music, immersive lighting, and late-night city energy.', 'Regional DJs and live electronic acts transform the riverside into a kinetic audiovisual playground.', 'Saigon Riverside Park', 'Thu Duc City, Ho Chi Minh City', '2026-10-24 11:00:00+00', '2026-10-24 09:00:00+00', '2026-08-25 11:00:00+00', '2026-10-24 09:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Saigon Electronic Weekender ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0006-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0006-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0006-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000007', 'Da Nang Ocean Sound', 'A seaside music festival pairing contemporary Vietnamese acts with sunset performances.', 'Ocean Sound combines coastal scenery, modern pop, and relaxed festival culture on the Da Nang waterfront.', 'East Sea Park', 'Vo Nguyen Giap, Son Tra, Da Nang', '2026-11-07 10:00:00+00', '2026-11-07 08:00:00+00', '2026-09-08 10:00:00+00', '2026-11-07 08:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Da Nang Ocean Sound ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0007-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0007-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0007-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000008', 'Mekong Acoustic Stories', 'An intimate evening of acoustic music inspired by southern landscapes and everyday stories.', 'Singer-songwriters from across Vietnam perform stripped-back sets beside the Mekong River.', 'Can Tho River Park', 'Ninh Kieu District, Can Tho', '2026-11-21 12:00:00+00', '2026-11-21 10:30:00+00', '2026-09-22 12:00:00+00', '2026-11-21 10:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mekong Acoustic Stories ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0008-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0008-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0008-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000009', 'Hue Imperial Soundscape', 'Traditional instruments meet contemporary composition in a dramatic heritage setting.', 'A cross-generational ensemble reimagines the musical identity of Hue through light, movement, and live orchestration.', 'Ngo Mon Square', 'Hue Imperial City, Hue', '2026-12-05 12:30:00+00', '2026-12-05 11:00:00+00', '2026-10-06 12:30:00+00', '2026-12-05 10:30:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hue Imperial Soundscape ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0009-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0009-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0009-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1468359601543-843bfaef291a?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000010', 'Vietnam Hip Hop Festival', 'A full-day celebration of rap, dance crews, beatmakers, and street culture.', 'Leading and emerging Vietnamese hip-hop artists share a festival stage designed for cyphers, battles, and headline sets.', 'Gia Dinh Park', 'Go Vap District, Ho Chi Minh City', '2026-12-19 08:00:00+00', '2026-12-19 06:00:00+00', '2026-10-20 08:00:00+00', '2026-12-19 06:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vietnam Hip Hop Festival ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0010-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0010-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0010-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1524650359799-842906ca1c06?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000011', 'New Year Countdown Hanoi 2027', 'A city-center countdown featuring live artists, visual projections, and a midnight celebration.', 'Vietnamese pop performers and DJs welcome the new year with a large public production in the heart of Hanoi.', 'August Revolution Square', 'Hoan Kiem District, Hanoi', '2026-12-31 13:00:00+00', '2026-12-31 11:00:00+00', '2026-11-01 13:00:00+00', '2026-12-31 11:00:00+00', 'SOLD_OUT', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="New Year Countdown Hanoi 2027 ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0011-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0011-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0011-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000012', 'Spring Bloom Music Festival', 'A joyful spring festival with pop, folk-inspired stages, food, and outdoor experiences.', 'Spring Bloom welcomes the new season through contemporary Vietnamese music and colorful cultural collaborations.', 'Yen So Park', 'Hoang Mai District, Hanoi', '2027-02-20 09:00:00+00', '2027-02-20 07:00:00+00', '2026-12-22 09:00:00+00', '2027-02-20 07:00:00+00', 'DRAFT', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spring Bloom Music Festival ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0012-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0012-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0012-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000013', 'Women in Music Vietnam', 'A showcase of women shaping Vietnam''s current music landscape across genres and generations.', 'Vocalists, producers, instrumentalists, and songwriters lead an evening centered on artistry and creative independence.', 'Hoa Binh Theater', 'District 10, Ho Chi Minh City', '2027-03-13 12:30:00+00', '2027-03-13 11:00:00+00', '2027-01-12 12:30:00+00', '2027-03-13 10:30:00+00', 'CANCELLED', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Women in Music Vietnam ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0013-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0013-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0013-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1488841714725-bb4c32d1ac94?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000014', 'Rock the Red River', 'A loud, guitar-driven festival bringing together alternative and rock bands from across Vietnam.', 'Rock the Red River is built for live-band energy, festival crowds, and a stage that gets heavier after sunset.', 'Long Bien Riverside', 'Long Bien District, Hanoi', '2027-04-03 10:00:00+00', '2027-04-03 08:00:00+00', '2027-02-02 10:00:00+00', '2027-04-03 08:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rock the Red River ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0014-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0014-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0014-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1501612780327-45045538702b?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000015', 'Jazz by the River', 'An elegant riverside evening of jazz ensembles, vocal standards, and modern improvisation.', 'Vietnamese jazz musicians and international guests share a relaxed open-air program beside the Saigon River.', 'Bach Dang Wharf Park', 'District 1, Ho Chi Minh City', '2027-04-24 11:30:00+00', '2027-04-24 10:00:00+00', '2027-02-23 11:30:00+00', '2027-04-24 09:30:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jazz by the River ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0015-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0015-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0015-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000016', 'Nha Trang Summer Waves', 'A beachside summer concert combining pop anthems, dance music, and ocean views.', 'Summer Waves turns the Nha Trang coast into a vibrant live stage for holiday crowds and music fans.', 'April 2 Square', 'Tran Phu, Nha Trang', '2027-05-15 10:30:00+00', '2027-05-15 08:30:00+00', '2027-03-16 10:30:00+00', '2027-05-15 08:30:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nha Trang Summer Waves ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0016-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0016-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0016-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1509824227185-9c5a01ceba0d?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000017', 'Campus Sound 2027', 'A high-energy youth festival featuring university bands, rising artists, and creative showcases.', 'Campus Sound gives student communities and emerging performers a major live platform in Ho Chi Minh City.', 'Vietnam National University Urban Area', 'Thu Duc City, Ho Chi Minh City', '2027-06-05 09:00:00+00', '2027-06-05 07:00:00+00', '2027-04-06 09:00:00+00', '2027-06-05 07:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Campus Sound 2027 ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0017-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0017-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0017-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000018', 'Vietnam Symphony Under the Stars', 'A cinematic outdoor symphony program featuring familiar themes and Vietnamese compositions.', 'A full orchestra performs beneath the night sky with projection design and guest soloists.', 'Thang Long Imperial Citadel', 'Ba Dinh District, Hanoi', '2027-06-26 12:30:00+00', '2027-06-26 11:00:00+00', '2027-04-27 12:30:00+00', '2027-06-26 10:30:00+00', 'SOLD_OUT', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vietnam Symphony Under the Stars ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0018-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0018-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0018-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000019', 'Hoi An Lantern Sessions', 'A warm acoustic concert framed by lantern light, heritage architecture, and intimate performances.', 'Lantern Sessions invites artists to reinterpret beloved songs in a calm, story-led setting.', 'An Hoi Sculpture Garden', 'Hoi An, Quang Nam', '2027-07-17 12:00:00+00', '2027-07-17 10:30:00+00', '2027-05-18 12:00:00+00', '2027-07-17 10:00:00+00', 'DRAFT', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hoi An Lantern Sessions ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0019-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0019-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0019-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);
INSERT INTO public.concerts (id, title, description, artist_bio, venue_name, venue_address, event_date, doors_open_at, sale_start_at, sale_end_at, status, seat_map_svg, poster_url, created_by, created_at, updated_at, poster_public_id, is_public) VALUES ('10000000-0000-0000-0000-000000000020', 'TicketBox City Lights Festival', 'A flagship multi-stage festival connecting pop, indie, electronic, and visual arts.', 'City Lights closes the demo season with a broad lineup and the full TicketBox festival experience.', 'The Global City', 'Thu Duc City, Ho Chi Minh City', '2027-08-07 08:00:00+00', '2027-08-07 06:00:00+00', '2027-06-08 08:00:00+00', '2027-08-07 06:00:00+00', 'ON_SALE', '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TicketBox City Lights Festival ticket zone map">
          <rect width="720" height="520" rx="20" fill="#0e0e11"/>
          <path d="M205 38 H515 Q540 38 548 62 L560 105 H160 L172 62 Q180 38 205 38 Z" fill="#71362d" stroke="#ff765f" stroke-width="2"/>
          <text x="360" y="75" text-anchor="middle" fill="#ff9a86" font-size="18" font-weight="700" font-family="Arial">STAGE</text>
          <g data-ticket-type-id="21000000-0000-0000-0020-000000000001" data-zone-name="VIP" tabindex="0" role="button" aria-label="Select VIP ticket zone">
            <path d="M210 140 H510 L540 230 H180 Z" fill="#e11d48" fill-opacity="0.34" stroke="#e11d48" stroke-width="2"/>
            <text x="360" y="192" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Arial">VIP</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0020-000000000002" data-zone-name="STANDARD" tabindex="0" role="button" aria-label="Select Standard ticket zone">
            <path d="M130 260 H590 L625 360 H95 Z" fill="#8f7aff" fill-opacity="0.30" stroke="#8f7aff" stroke-width="2"/>
            <text x="360" y="318" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">STANDARD</text>
          </g>
          <g data-ticket-type-id="21000000-0000-0000-0020-000000000003" data-zone-name="GA" tabindex="0" role="button" aria-label="Select GA ticket zone">
            <path d="M55 390 H665 L690 470 H30 Z" fill="#0891b2" fill-opacity="0.28" stroke="#0891b2" stroke-width="2"/>
            <text x="360" y="438" text-anchor="middle" fill="white" font-size="20" font-weight="700" font-family="Arial">GA</text>
          </g>
        </svg>', 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1800&q=85', '00000000-0000-0000-0000-000000000001', '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00', NULL, true);


--
-- Data for Name: artist_pdf_jobs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ticket_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'SVIP', 3500000, 200, 200, 2, '#dc2626', true, '2026-11-04 11:07:38.519475+00', '2026-11-04 11:07:38.519475+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'VIP', 2500000, 500, 500, 4, '#f97316', true, '2026-11-04 11:07:38.519475+00', '2026-11-04 11:07:38.519475+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'CAT1', 1500000, 1000, 1000, 4, '#16a34a', true, '2026-11-04 11:07:38.519475+00', '2026-11-04 11:07:38.519475+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'GA', 900000, 3000, 3000, 6, '#0891b2', true, '2026-11-04 11:07:38.519475+00', '2026-11-04 11:07:38.519475+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', 'STAFF_TEST_ZONE', 0, 3, 0, 4, '#287565', true, '2026-11-04 11:07:38.626906+00', '2026-11-04 11:07:38.626906+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('70000000-0000-0000-0000-000000000101', '70000000-0000-0000-0000-000000000001', 'DEMO CHECK-IN', 499000, 10, 0, 10, '#287565', true, '2026-11-04 11:07:38.972624+00', '2026-11-04 11:07:38.972624+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0002-000000000001', '10000000-0000-0000-0000-000000000002', 'VIP', 2400000, 250, 165, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0002-000000000002', '10000000-0000-0000-0000-000000000002', 'STANDARD', 1500000, 800, 528, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0002-000000000003', '10000000-0000-0000-0000-000000000002', 'GA', 1200000, 2000, 1320, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0003-000000000001', '10000000-0000-0000-0000-000000000003', 'VIP', 1900000, 250, 195, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0003-000000000002', '10000000-0000-0000-0000-000000000003', 'STANDARD', 1187500, 800, 624, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0003-000000000003', '10000000-0000-0000-0000-000000000003', 'GA', 950000, 2000, 1560, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0004-000000000001', '10000000-0000-0000-0000-000000000004', 'VIP', 2200000, 250, 105, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0004-000000000002', '10000000-0000-0000-0000-000000000004', 'STANDARD', 1375000, 800, 336, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0004-000000000003', '10000000-0000-0000-0000-000000000004', 'GA', 1100000, 2000, 840, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0005-000000000001', '10000000-0000-0000-0000-000000000005', 'VIP', 1100000, 250, 135, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0005-000000000002', '10000000-0000-0000-0000-000000000005', 'STANDARD', 687500, 800, 432, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0005-000000000003', '10000000-0000-0000-0000-000000000005', 'GA', 550000, 2000, 1080, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0006-000000000001', '10000000-0000-0000-0000-000000000006', 'VIP', 1600000, 250, 165, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0006-000000000002', '10000000-0000-0000-0000-000000000006', 'STANDARD', 1000000, 800, 528, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0006-000000000003', '10000000-0000-0000-0000-000000000006', 'GA', 800000, 2000, 1320, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0007-000000000001', '10000000-0000-0000-0000-000000000007', 'VIP', 1400000, 250, 195, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0007-000000000002', '10000000-0000-0000-0000-000000000007', 'STANDARD', 875000, 800, 624, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0007-000000000003', '10000000-0000-0000-0000-000000000007', 'GA', 700000, 2000, 1560, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0008-000000000001', '10000000-0000-0000-0000-000000000008', 'VIP', 900000, 250, 105, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0008-000000000002', '10000000-0000-0000-0000-000000000008', 'STANDARD', 562500, 800, 336, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0008-000000000003', '10000000-0000-0000-0000-000000000008', 'GA', 450000, 2000, 840, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0009-000000000001', '10000000-0000-0000-0000-000000000009', 'VIP', 1300000, 250, 135, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0009-000000000002', '10000000-0000-0000-0000-000000000009', 'STANDARD', 812500, 800, 432, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0009-000000000003', '10000000-0000-0000-0000-000000000009', 'GA', 650000, 2000, 1080, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0010-000000000001', '10000000-0000-0000-0000-000000000010', 'VIP', 1500000, 250, 165, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0010-000000000002', '10000000-0000-0000-0000-000000000010', 'STANDARD', 937500, 800, 528, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0010-000000000003', '10000000-0000-0000-0000-000000000010', 'GA', 750000, 2000, 1320, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0011-000000000001', '10000000-0000-0000-0000-000000000011', 'VIP', 1800000, 250, 0, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0011-000000000002', '10000000-0000-0000-0000-000000000011', 'STANDARD', 1125000, 800, 0, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0011-000000000003', '10000000-0000-0000-0000-000000000011', 'GA', 900000, 2000, 0, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0012-000000000001', '10000000-0000-0000-0000-000000000012', 'VIP', 1200000, 250, 250, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0012-000000000002', '10000000-0000-0000-0000-000000000012', 'STANDARD', 750000, 800, 800, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0012-000000000003', '10000000-0000-0000-0000-000000000012', 'GA', 600000, 2000, 2000, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0013-000000000001', '10000000-0000-0000-0000-000000000013', 'VIP', 1700000, 250, 0, 2, '#e11d48', false, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0013-000000000002', '10000000-0000-0000-0000-000000000013', 'STANDARD', 1062500, 800, 0, 4, '#8f7aff', false, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0013-000000000003', '10000000-0000-0000-0000-000000000013', 'GA', 850000, 2000, 0, 6, '#0891b2', false, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0014-000000000001', '10000000-0000-0000-0000-000000000014', 'VIP', 1400000, 250, 165, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0014-000000000002', '10000000-0000-0000-0000-000000000014', 'STANDARD', 875000, 800, 528, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0014-000000000003', '10000000-0000-0000-0000-000000000014', 'GA', 700000, 2000, 1320, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0015-000000000001', '10000000-0000-0000-0000-000000000015', 'VIP', 1600000, 250, 195, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0015-000000000002', '10000000-0000-0000-0000-000000000015', 'STANDARD', 1000000, 800, 624, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0015-000000000003', '10000000-0000-0000-0000-000000000015', 'GA', 800000, 2000, 1560, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0016-000000000001', '10000000-0000-0000-0000-000000000016', 'VIP', 1300000, 250, 105, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0016-000000000002', '10000000-0000-0000-0000-000000000016', 'STANDARD', 812500, 800, 336, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0016-000000000003', '10000000-0000-0000-0000-000000000016', 'GA', 650000, 2000, 840, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0017-000000000001', '10000000-0000-0000-0000-000000000017', 'VIP', 700000, 250, 135, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0017-000000000002', '10000000-0000-0000-0000-000000000017', 'STANDARD', 437500, 800, 432, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0017-000000000003', '10000000-0000-0000-0000-000000000017', 'GA', 350000, 2000, 1080, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0018-000000000001', '10000000-0000-0000-0000-000000000018', 'VIP', 2000000, 250, 0, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0018-000000000002', '10000000-0000-0000-0000-000000000018', 'STANDARD', 1250000, 800, 0, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0018-000000000003', '10000000-0000-0000-0000-000000000018', 'GA', 1000000, 2000, 0, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0019-000000000001', '10000000-0000-0000-0000-000000000019', 'VIP', 1100000, 250, 250, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0019-000000000002', '10000000-0000-0000-0000-000000000019', 'STANDARD', 687500, 800, 800, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0019-000000000003', '10000000-0000-0000-0000-000000000019', 'GA', 550000, 2000, 2000, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0020-000000000001', '10000000-0000-0000-0000-000000000020', 'VIP', 1700000, 250, 105, 2, '#e11d48', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0020-000000000002', '10000000-0000-0000-0000-000000000020', 'STANDARD', 1062500, 800, 336, 4, '#8f7aff', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');
INSERT INTO public.ticket_types (id, concert_id, name, price, total_quantity, available_qty, max_per_account, zone_color, is_active, created_at, updated_at) VALUES ('21000000-0000-0000-0020-000000000003', '10000000-0000-0000-0000-000000000020', 'GA', 850000, 2000, 840, 6, '#0891b2', true, '2026-11-04 11:07:39.031724+00', '2026-11-04 11:07:39.031724+00');


--
-- PostgreSQL database dump complete
--


