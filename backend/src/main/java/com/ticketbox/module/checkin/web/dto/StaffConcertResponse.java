package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record StaffConcertResponse(
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
