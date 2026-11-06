package org.ticketbox.ticketing.integration.catalog;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ConcertView(
    UUID id,
    String title,
    String status,
    OffsetDateTime eventDate,
    OffsetDateTime saleStartAt,
    OffsetDateTime saleEndAt
) {}
