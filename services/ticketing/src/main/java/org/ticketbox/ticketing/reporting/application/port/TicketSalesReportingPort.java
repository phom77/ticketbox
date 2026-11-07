package org.ticketbox.ticketing.reporting.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface TicketSalesReportingPort {
    RevenueSummaryView getRevenueSummary(UUID concertId);

    List<ZoneRevenueView> getZoneRevenue(UUID concertId);

    List<SalesTrendView> getDailySalesTrend(
            UUID concertId, OffsetDateTime startDate, OffsetDateTime endDate);
}
