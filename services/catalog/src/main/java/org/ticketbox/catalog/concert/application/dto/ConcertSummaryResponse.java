package org.ticketbox.catalog.concert.application.dto;

import org.ticketbox.catalog.concert.domain.ConcertText;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record ConcertSummaryResponse(
        UUID id,
        String title,
        String venueName,
        OffsetDateTime eventDate,
        OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        String status,
        String posterUrl,
        Map<String, ConcertText> translations) {}
