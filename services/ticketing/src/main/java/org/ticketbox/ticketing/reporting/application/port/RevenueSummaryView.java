package org.ticketbox.ticketing.reporting.application.port;

import java.math.BigDecimal;

public record RevenueSummaryView(BigDecimal totalRevenue, long totalTicketsSold) {}
