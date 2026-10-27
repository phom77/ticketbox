
package com.ticketbox.module.concert.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ConcertSummaryResponse(
        UUID id,
        String title,
        String venueName,
        OffsetDateTime eventDate,
        OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        String status,
        String posterUrl
) {}
