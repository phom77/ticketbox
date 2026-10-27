package com.ticketbox.module.admin.web.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record RevenueSummaryResponse(
        UUID concertId,
        BigDecimal totalRevenue,
        long totalTicketsSold,
        long totalTicketsAvailable,
        BigDecimal soldRate) {
}
