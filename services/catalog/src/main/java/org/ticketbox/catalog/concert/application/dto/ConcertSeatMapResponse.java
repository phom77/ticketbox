package org.ticketbox.catalog.concert.application.dto;

import java.util.UUID;

public record ConcertSeatMapResponse(UUID concertId, String seatMapSvg) {}
