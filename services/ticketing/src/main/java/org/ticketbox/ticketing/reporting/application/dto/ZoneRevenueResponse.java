package org.ticketbox.ticketing.reporting.application.dto;

import java.math.BigDecimal;

public record ZoneRevenueResponse(
        String zoneName,
        BigDecimal price,
        long soldQuantity,
        long availableQuantity,
        long totalQuantity,
        BigDecimal revenue,
        BigDecimal soldRate) {}
