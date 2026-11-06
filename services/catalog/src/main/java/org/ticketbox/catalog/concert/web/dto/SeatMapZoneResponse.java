package org.ticketbox.catalog.concert.web.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record SeatMapZoneResponse(
        UUID ticketTypeId,
        String name,
        String zoneColor,
        BigDecimal price,
        int totalQuantity,
        int availableQuantity
) {}
