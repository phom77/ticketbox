package org.ticketbox.ticketing.application.port.catalog;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ConcertReportingView(
        UUID id, String title, OffsetDateTime eventDate, String status) {}
