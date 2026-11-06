package org.ticketbox.ticketing.reporting;

import java.math.BigDecimal;

public record RevenueSummaryView(
    BigDecimal totalRevenue,
    long totalTicketsSold
) {}
