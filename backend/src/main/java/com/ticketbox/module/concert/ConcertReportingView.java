package com.ticketbox.module.concert;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ConcertReportingView(
        UUID id,
        String title,
        OffsetDateTime eventDate,
        String status) {
}
