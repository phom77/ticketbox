package com.ticketbox.module.ticket;

import java.util.List;
import java.util.UUID;
import java.time.OffsetDateTime;

public interface TicketSalesReportingPort {
    RevenueSummaryView getRevenueSummary(UUID concertId);
    List<ZoneRevenueView> getZoneRevenue(UUID concertId);
    List<SalesTrendView> getDailySalesTrend(
        UUID concertId,
        OffsetDateTime startDate,
        OffsetDateTime endDate
    );
}
