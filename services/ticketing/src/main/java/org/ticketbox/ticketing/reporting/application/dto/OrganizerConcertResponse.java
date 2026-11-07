package org.ticketbox.ticketing.reporting.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record OrganizerConcertResponse(
        UUID id, String title, OffsetDateTime eventDate, String status) {}
