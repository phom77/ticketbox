package com.ticketbox.module.ticket.infrastructure;

import com.ticketbox.module.ticket.RevenueSummaryView;
import com.ticketbox.module.ticket.SalesTrendView;
import com.ticketbox.module.ticket.TicketSalesReportingPort;
import com.ticketbox.module.ticket.domain.TicketSalesReportingRepository;
import com.ticketbox.module.ticket.ZoneRevenueView;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TicketSalesReportingAdapter implements TicketSalesReportingPort {

    private final TicketSalesReportingRepository reportingRepository;

    @Override
    public RevenueSummaryView getRevenueSummary(UUID concertId) {
        TicketSalesReportingRepository.RevenueSummaryProjection result =
                reportingRepository.findRevenueSummary(concertId);

        if (result == null) {
            return new RevenueSummaryView(BigDecimal.ZERO, 0);
        }

        return new RevenueSummaryView(
                defaultRevenue(result.getTotalRevenue()),
                defaultQuantity(result.getTotalTicketsSold()));
    }

    @Override
    public List<ZoneRevenueView> getZoneRevenue(UUID concertId) {
        return reportingRepository.findZoneRevenue(concertId).stream()
                .map(result -> new ZoneRevenueView(
                        result.getTicketTypeId(),
                        defaultQuantity(result.getSoldQuantity()),
                        defaultRevenue(result.getRevenue())))
                .toList();
    }

    @Override
    public List<SalesTrendView> getDailySalesTrend(
            UUID concertId,
            OffsetDateTime startDate,
            OffsetDateTime endDate) {
        return reportingRepository.findDailySalesTrend(concertId, startDate, endDate).stream()
                .map(result -> new SalesTrendView(
                        result.getDate(),
                        defaultQuantity(result.getTicketsSold()),
                        defaultRevenue(result.getRevenue())))
                .toList();
    }

    private long defaultQuantity(Long quantity) {
        return quantity == null ? 0 : quantity;
    }

    private BigDecimal defaultRevenue(BigDecimal revenue) {
        return revenue == null ? BigDecimal.ZERO : revenue;
    }
}
