package com.ticketbox.module.concert.web.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketTypeResponse(
        UUID id,
        UUID concertId,
        String name,
        BigDecimal price,
        int totalQuantity,
        int availableQty,
        int maxPerAccount,
        String zoneColor,
        boolean isActive,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {}
