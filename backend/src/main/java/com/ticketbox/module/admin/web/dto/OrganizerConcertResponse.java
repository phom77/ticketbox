package com.ticketbox.module.admin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record OrganizerConcertResponse(
        UUID id,
        String title,
        OffsetDateTime eventDate,
        String status) {
}
