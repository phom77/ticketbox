package org.ticketbox.catalog.concert.web.dto;

import java.util.UUID;

public record ConcertSeatMapResponse(
        UUID concertId,
        String seatMapSvg
) {}
