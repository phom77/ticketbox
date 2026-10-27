package com.ticketbox.module.admin.application;

import com.ticketbox.module.admin.web.dto.OrganizerConcertResponse;
import com.ticketbox.module.admin.web.dto.RevenueSummaryResponse;
import com.ticketbox.module.admin.web.dto.SalesTrendResponse;
import com.ticketbox.module.admin.web.dto.ZoneRevenueResponse;
import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.module.concert.ConcertReportingView;
import com.ticketbox.module.concert.TicketTypeReportingView;
import com.ticketbox.module.ticket.RevenueSummaryView;
import com.ticketbox.module.ticket.SalesTrendView;
import com.ticketbox.module.ticket.TicketSalesReportingPort;
import com.ticketbox.module.ticket.ZoneRevenueView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class OrganizerRevenueService {

    private static final String COMPLETED_STATUS = "COMPLETED";
    private static final ZoneId REPORTING_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ConcertReportingPort concertReportingPort;
    private final TicketSalesReportingPort ticketSalesReportingPort;

    public OrganizerRevenueService(
            ConcertReportingPort concertReportingPort,
            TicketSalesReportingPort ticketSalesReportingPort) {
        this.concertReportingPort = concertReportingPort;
        this.ticketSalesReportingPort = ticketSalesReportingPort;
    }

    public Page<OrganizerConcertResponse> getCompletedConcerts(
            UUID organizerId,
            Pageable pageable) {
        return concertReportingPort.findCompletedConcerts(organizerId, pageable)
                .map(concert -> new OrganizerConcertResponse(
                        concert.id(),
                        concert.title(),
                        concert.eventDate(),
                        concert.status()));
    }

    public RevenueSummaryResponse getRevenueSummary(UUID concertId, UUID organizerId) {
        requireCompletedOwnedConcert(concertId, organizerId);

        RevenueSummaryView sales = ticketSalesReportingPort.getRevenueSummary(concertId);
        long totalCapacity = concertReportingPort.findTicketTypes(concertId).stream()
                .mapToLong(TicketTypeReportingView::totalQuantity)
                .sum();

        return new RevenueSummaryResponse(
                concertId,
                sales.totalRevenue(),
                sales.totalTicketsSold(),
                totalCapacity,
                calculateSoldRate(sales.totalTicketsSold(), totalCapacity));
    }

    public String getCompletedConcertName(UUID concertId, UUID organizerId) {
        return requireCompletedOwnedConcert(concertId, organizerId).title();
    }

    public List<ZoneRevenueResponse> getZoneRevenue(UUID concertId, UUID organizerId) {
        requireCompletedOwnedConcert(concertId, organizerId);

        Map<UUID, ZoneRevenueView> salesByTicketType =
                ticketSalesReportingPort.getZoneRevenue(concertId).stream()
                        .collect(Collectors.toMap(
                                ZoneRevenueView::ticketTypeId,
                                Function.identity()));

        return concertReportingPort.findTicketTypes(concertId).stream()
                .sorted((left, right) -> right.price().compareTo(left.price()))
                .map(ticketType -> toZoneResponse(
                        ticketType,
                        salesByTicketType.get(ticketType.id())))
                .toList();
    }

    public List<SalesTrendResponse> getDailySalesTrend(
            UUID concertId,
            UUID organizerId,
            LocalDate from,
            LocalDate to) {
        requireCompletedOwnedConcert(concertId, organizerId);
        validateDateRange(from, to);

        OffsetDateTime startDate = from.atStartOfDay(REPORTING_ZONE).toOffsetDateTime();
        OffsetDateTime endDateExclusive = to.plusDays(1)
                .atStartOfDay(REPORTING_ZONE)
                .toOffsetDateTime();

        Map<LocalDate, SalesTrendResponse> trendByDate = new LinkedHashMap<>();
        from.datesUntil(to.plusDays(1))
                .forEach(date -> trendByDate.put(
                        date,
                        new SalesTrendResponse(date, 0, BigDecimal.ZERO)));

        for (SalesTrendView trend : ticketSalesReportingPort.getDailySalesTrend(
                concertId,
                startDate,
                endDateExclusive)) {
            LocalDate date = LocalDate.parse(trend.date());
            if (trendByDate.containsKey(date)) {
                trendByDate.put(date, new SalesTrendResponse(
                        date,
                        trend.ticketsSold(),
                        trend.revenue()));
            }
        }

        return List.copyOf(trendByDate.values());
    }

    private ConcertReportingView requireCompletedOwnedConcert(
            UUID concertId,
            UUID organizerId) {
        ConcertReportingView concert = concertReportingPort
                .findOwnedConcert(concertId, organizerId)
                .orElseThrow(() -> new AppException(
                        ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert"));

        if (!COMPLETED_STATUS.equals(concert.status())) {
            throw new AppException(ErrorCode.CONCERT_NOT_COMPLETED);
        }

        return concert;
    }

    private ZoneRevenueResponse toZoneResponse(
            TicketTypeReportingView ticketType,
            ZoneRevenueView sales) {
        long soldQuantity = sales == null ? 0 : sales.soldQuantity();
        BigDecimal revenue = sales == null ? BigDecimal.ZERO : sales.revenue();
        long availableQuantity = Math.max(0, ticketType.totalQuantity() - soldQuantity);

        return new ZoneRevenueResponse(
                ticketType.name(),
                ticketType.price(),
                soldQuantity,
                availableQuantity,
                ticketType.totalQuantity(),
                revenue,
                calculateSoldRate(soldQuantity, ticketType.totalQuantity()));
    }

    private BigDecimal calculateSoldRate(long soldQuantity, long totalQuantity) {
        if (totalQuantity == 0) {
            return BigDecimal.ZERO.setScale(1);
        }

        return BigDecimal.valueOf(soldQuantity)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(totalQuantity), 1, RoundingMode.HALF_UP);
    }

    private void validateDateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
        }
    }
}
