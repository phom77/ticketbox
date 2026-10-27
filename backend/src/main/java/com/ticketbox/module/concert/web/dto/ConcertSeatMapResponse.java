package com.ticketbox.module.concert.web.dto;

import java.util.UUID;

public record ConcertSeatMapResponse(
        UUID concertId,
        String seatMapSvg
) {}
