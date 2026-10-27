package com.ticketbox.module.ticket;

import java.math.BigDecimal;

public record RevenueSummaryView(
    BigDecimal totalRevenue,
    long totalTicketsSold
) {}
