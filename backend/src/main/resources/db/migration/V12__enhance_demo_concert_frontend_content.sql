UPDATE concerts
SET
    description = 'A high-energy stadium production bringing together live music, choreography, immersive visuals, and thousands of fans for one unforgettable night in Ho Chi Minh City.',
    artist_bio = 'Anh Trai Say Hi is a contemporary Vietnamese music project that brings a new generation of performers together through original stages, collaboration, and live audience energy. The concert expands that spirit into a full-scale stadium experience, pairing fan-favorite songs with exclusive arrangements and cinematic production.',
    poster_url = 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1800&q=85',
    seat_map_svg = '<svg viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anh Trai Say Hi ticket zone map">
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
    </svg>',
    updated_at = NOW()
WHERE id = '10000000-0000-0000-0000-000000000001';
