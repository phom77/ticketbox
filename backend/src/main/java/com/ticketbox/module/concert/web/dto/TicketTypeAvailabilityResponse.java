package com.ticketbox.module.concert.web.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record TicketTypeAvailabilityResponse(
        UUID concertId,
        List<AvailabilityItem> items,
        OffsetDateTime refreshedAt
) {
    public record AvailabilityItem(
            UUID ticketTypeId,
            String name,
            int availableQty,
            int totalQuantity
    ) {}
}
