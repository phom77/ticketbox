package org.ticketbox.ticketing.reporting.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Breakdown;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.BreakdownRow;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.PerformanceStatus;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Report;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Scope;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Summary;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Trend;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.TrendBucket;
import org.ticketbox.ticketing.reporting.application.port.SalesReportStore;
import org.ticketbox.ticketing.reporting.application.port.SalesReportStore.Figures;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Live sales figures from the sales ledger (ADR 0005). Sales count on the payment date and refunds on the refund
 * confirmation date. Money values are produced only when {@code money} is true (the FINANCE grant).
 */
@Service
@Transactional(readOnly = true)
public class SalesReportService {
    static final int MAX_PERIOD_DAYS = 1096;
    static final int MAX_HOUR_DAYS = 7;
    static final int MAX_DAY_DAYS = 366;

    private final SalesReportStore store;

    public SalesReportService(SalesReportStore store) {
        this.store = store;
    }

    public Summary summary(UUID organization, UUID eventId, UUID performanceId, LocalDate from, LocalDate to,
            boolean money) {
        var context = context(organization, eventId, performanceId, from, to);
        Figures figures = store.totals(context.scope, context.start, context.end);
        Long capacity = null;
        BigDecimal sellThrough = null;
        if (context.scope.eventId() != null || context.scope.performanceId() != null) {
            var ids = store.performanceIds(context.scope);
            long total = store.capacities(ids).values().stream().mapToLong(Long::longValue).sum();
            long net = store.netTickets(organization, ids).values().stream().mapToLong(Long::longValue).sum();
            capacity = total;
            sellThrough = rate(net, total);
        }
        return new Summary(describe(context), from, to, context.zone.getId(),
                store.provisional(context.scope, context.start, context.end), figures.ticketsSold(),
                figures.ticketsRefunded(), figures.netTickets(), figures.orders(), capacity, sellThrough,
                money ? figures.gross() : null, money ? figures.refunds() : null, money ? figures.net() : null);
    }

    public Trend trend(UUID organization, UUID eventId, UUID performanceId, LocalDate from, LocalDate to,
            String groupBy, boolean money) {
        var context = context(organization, eventId, performanceId, from, to);
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        String unit = groupBy == null ? defaultGrouping(days) : groupBy.toLowerCase(Locale.ROOT);
        long allowed = switch (unit) {
            case "hour" -> MAX_HOUR_DAYS;
            case "day" -> MAX_DAY_DAYS;
            case "week" -> MAX_PERIOD_DAYS;
            default -> throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.unsupported-grouping");
        };
        if (days > allowed) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.grouping-range", unit, allowed);
        }
        Map<LocalDateTime, Figures> found = new LinkedHashMap<>();
        store.trend(context.scope, context.start, context.end, context.zone, unit)
                .forEach(bucket -> found.put(bucket.start(), bucket.figures()));
        List<TrendBucket> buckets = new ArrayList<>();
        LocalDateTime cursor = firstBucket(from, unit);
        LocalDateTime last = "hour".equals(unit) ? to.atStartOfDay().plusHours(23) : firstBucket(to, unit);
        while (!cursor.isAfter(last)) {
            Figures figures = found.getOrDefault(cursor, Figures.ZERO);
            buckets.add(new TrendBucket(cursor, figures.ticketsSold(), figures.ticketsRefunded(), figures.netTickets(),
                    figures.orders(), money ? figures.gross() : null, money ? figures.refunds() : null,
                    money ? figures.net() : null));
            cursor = switch (unit) {
                case "hour" -> cursor.plusHours(1);
                case "day" -> cursor.plusDays(1);
                default -> cursor.plusWeeks(1);
            };
        }
        return new Trend(unit, context.zone.getId(), from, to,
                store.provisional(context.scope, context.start, context.end), buckets);
    }

    public Breakdown breakdown(UUID organization, UUID eventId, UUID performanceId, LocalDate from, LocalDate to,
            String by, boolean money) {
        var context = context(organization, eventId, performanceId, from, to);
        String kind = by == null ? "" : by.toLowerCase(Locale.ROOT);
        List<SalesReportStore.BreakdownRow> rows;
        switch (kind) {
            case "performance" -> rows = store.byPerformance(context.scope, context.start, context.end);
            case "offer" -> {
                if (eventId == null && performanceId == null) {
                    throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.offer-needs-scope");
                }
                rows = store.byOffer(context.scope, context.start, context.end);
            }
            default -> throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.unsupported-breakdown");
        }
        var ids = rows.stream().map(SalesReportStore.BreakdownRow::performanceId).distinct().toList();
        var capacity = "performance".equals(kind) ? store.capacities(ids) : Map.<UUID, Long>of();
        var net = "performance".equals(kind) ? store.netTickets(organization, ids) : Map.<UUID, Long>of();
        var mapped = rows.stream().map(row -> {
            Figures f = row.figures();
            Long cap = capacity.get(row.performanceId());
            BigDecimal through = cap == null ? null : rate(net.getOrDefault(row.performanceId(), 0L), cap);
            return new BreakdownRow(row.key(), row.performanceId(), row.eventId(), row.label(), row.detail(),
                    row.performanceTitle(), row.startsAt(), row.provisional(), f.ticketsSold(), f.ticketsRefunded(),
                    f.netTickets(), f.orders(), cap, through, money ? f.gross() : null, money ? f.refunds() : null,
                    money ? f.net() : null);
        }).toList();
        return new Breakdown(kind, context.zone.getId(), from, to,
                rows.stream().anyMatch(SalesReportStore.BreakdownRow::provisional), mapped);
    }

    /** The whole report for exports: money is always included, so callers must check FINANCE first. */
    public Report report(UUID organization, UUID eventId, UUID performanceId, LocalDate from, LocalDate to) {
        boolean scoped = eventId != null || performanceId != null;
        return new Report(summary(organization, eventId, performanceId, from, to, true),
                trend(organization, eventId, performanceId, from, to, null, true),
                breakdown(organization, eventId, performanceId, from, to, "performance", true),
                scoped ? breakdown(organization, eventId, performanceId, from, to, "offer", true) : null);
    }

    public List<PerformanceStatus> onSale(UUID organization, OffsetDateTime now) {
        return statuses(organization, store.onSale(organization, now, 50));
    }

    public List<PerformanceStatus> upcoming(UUID organization, OffsetDateTime now, int days) {
        int window = Math.clamp(days, 1, 31);
        return statuses(organization, store.upcoming(organization, now, now.plusDays(window), 50));
    }

    private List<PerformanceStatus> statuses(UUID organization, List<SalesReportStore.PerformanceStatus> rows) {
        return rows.stream().map(row -> new PerformanceStatus(row.performanceId(), row.eventId(), row.title(),
                row.startsAt(), row.netTickets(), row.capacity(),
                row.capacity() == null ? null : rate(row.netTickets(), row.capacity()))).toList();
    }

    private record Context(SalesReportStore.Scope scope, SalesReportStore.ScopeInfo info, ZoneId zone,
                           OffsetDateTime start, OffsetDateTime end) {}

    private Context context(UUID organization, UUID eventId, UUID performanceId, LocalDate from, LocalDate to) {
        if (from == null || to == null || from.isAfter(to)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.invalid-period");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_PERIOD_DAYS) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.sales.period-too-long", MAX_PERIOD_DAYS);
        }
        var scope = new SalesReportStore.Scope(organization, performanceId == null ? eventId : null, performanceId);
        if (performanceId != null && eventId != null) {
            scope = new SalesReportStore.Scope(organization, eventId, performanceId);
        }
        var info = store.resolve(scope).orElseThrow(
                () -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.resource-not-found"));
        ZoneId zone = info.zone();
        return new Context(scope, info, zone, from.atStartOfDay(zone).toOffsetDateTime(),
                to.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
    }

    private Scope describe(Context context) {
        var scope = context.scope;
        String type = scope.performanceId() != null ? "PERFORMANCE" : scope.eventId() != null ? "EVENT" : "ORGANIZATION";
        return new Scope(type, scope.eventId(), scope.performanceId(), context.info.name());
    }

    static String defaultGrouping(long days) {
        return days <= MAX_HOUR_DAYS ? "hour" : days <= MAX_DAY_DAYS ? "day" : "week";
    }

    private static LocalDateTime firstBucket(LocalDate date, String unit) {
        return switch (unit) {
            case "week" -> date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay();
            default -> date.atStartOfDay();
        };
    }

    private static BigDecimal rate(long part, long total) {
        if (total <= 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return BigDecimal.valueOf(Math.max(part, 0)).multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP);
    }
}
