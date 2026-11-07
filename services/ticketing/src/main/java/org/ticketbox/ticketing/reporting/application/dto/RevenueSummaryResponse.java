package org.ticketbox.ticketing.reporting.application.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record RevenueSummaryResponse(
        UUID concertId,
        BigDecimal totalRevenue,
        long totalTicketsSold,
        long totalTicketsAvailable,
        BigDecimal soldRate) {}
