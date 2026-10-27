package com.ticketbox.module.concert;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CheckinConcertView(
        UUID id,
        String title,
        String venueName,
        String venueAddress,
        OffsetDateTime eventDate,
        OffsetDateTime doorsOpenAt,
        String status,
        String posterUrl
) {
}
