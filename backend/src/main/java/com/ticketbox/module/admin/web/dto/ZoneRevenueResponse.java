package com.ticketbox.module.admin.web.dto;

import java.math.BigDecimal;

public record ZoneRevenueResponse(
        String zoneName,
        BigDecimal price,
        long soldQuantity,
        long availableQuantity,
        long totalQuantity,
        BigDecimal revenue,
        BigDecimal soldRate) {
}
