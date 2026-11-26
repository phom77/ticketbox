package org.ticketbox.ticketing.reporting.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Sales report payloads. Money fields are null, and therefore absent from the JSON, unless the caller holds the
 * FINANCE grant.
 */
public final class SalesReportResponses {
    private SalesReportResponses() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Scope(String type, UUID eventId, UUID performanceId, String name) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Summary(Scope scope, LocalDate from, LocalDate to, String timezone, boolean provisional,
                          long ticketsSold, long ticketsRefunded, long netTickets, long orders, Long capacity,
                          BigDecimal sellThrough, Long grossSales, Long refunds, Long netSales) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TrendBucket(LocalDateTime start, long ticketsSold, long ticketsRefunded, long netTickets,
                              long orders, Long grossSales, Long refunds, Long netSales) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Trend(String groupBy, String timezone, LocalDate from, LocalDate to, boolean provisional,
                        List<TrendBucket> buckets) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BreakdownRow(UUID key, UUID performanceId, UUID eventId, String label, String detail,
                               String performanceTitle, OffsetDateTime startsAt, boolean provisional,
                               long ticketsSold, long ticketsRefunded, long netTickets, long orders, Long capacity,
                               BigDecimal sellThrough, Long grossSales, Long refunds, Long netSales) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Breakdown(String by, String timezone, LocalDate from, LocalDate to, boolean provisional,
                            List<BreakdownRow> rows) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PerformanceStatus(UUID performanceId, UUID eventId, String title, OffsetDateTime startsAt,
                                    long netTickets, Long capacity, BigDecimal sellThrough) {}

    /** Everything an export contains: the same figures the screen shows. */
    public record Report(Summary summary, Trend trend, Breakdown performances, Breakdown offers) {}
}
