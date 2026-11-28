package org.ticketbox.ticketing.reporting.application.port;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Read model over the sales ledger (ADR 0005) and the local performance projections. */
public interface SalesReportStore {
    /** Organization scope when both ids are null. A performance id wins over an event id. */
    record Scope(UUID organizationId, UUID eventId, UUID performanceId) {}

    /** {@code zone} is the performance's own timezone, or null when the scope uses the organization's zone. */
    record ScopeInfo(String name, ZoneId zone) {}

    record Figures(long ticketsSold, long ticketsRefunded, long orders, long gross, long refunds) {
        public static final Figures ZERO = new Figures(0, 0, 0, 0, 0);

        public long netTickets() {
            return ticketsSold - ticketsRefunded;
        }

        public long net() {
            return gross - refunds;
        }
    }

    record Bucket(LocalDateTime start, Figures figures) {}

    record BreakdownRow(UUID key, UUID performanceId, UUID eventId, String label, String detail,
                        String performanceTitle, OffsetDateTime startsAt, boolean provisional, Figures figures) {}

    record PerformanceStatus(UUID performanceId, UUID eventId, String title, OffsetDateTime startsAt,
                             long netTickets, Long capacity) {}

    record PerformanceOption(UUID id, String title, OffsetDateTime startsAt, String timezone) {}

    record EventOption(UUID eventId, String title, List<PerformanceOption> performances) {}

    /** Events with performances in the organization, newest first; a legacy concert is its own event. */
    List<EventOption> events(UUID organizationId, String search, int offset, int limit);

    /** Empty when the event or performance does not belong to the organization. */
    Optional<ScopeInfo> resolve(Scope scope);

    Figures totals(Scope scope, OffsetDateTime from, OffsetDateTime to);

    /** {@code unit} is a PostgreSQL date_trunc unit: hour, day or week. */
    List<Bucket> trend(Scope scope, OffsetDateTime from, OffsetDateTime to, ZoneId zone, String unit);

    List<BreakdownRow> byPerformance(Scope scope, OffsetDateTime from, OffsetDateTime to);

    List<BreakdownRow> byOffer(Scope scope, OffsetDateTime from, OffsetDateTime to);

    /** True when a performance with figures in the period has not ended yet. */
    boolean provisional(Scope scope, OffsetDateTime from, OffsetDateTime to);

    List<UUID> performanceIds(Scope scope);

    /** Sellable capacity per performance (blocked seats excluded). */
    Map<UUID, Long> capacities(Collection<UUID> performanceIds);

    /** All-time net tickets per performance. */
    Map<UUID, Long> netTickets(UUID organizationId, Collection<UUID> performanceIds);

    List<PerformanceStatus> onSale(UUID organizationId, OffsetDateTime now, int limit);

    List<PerformanceStatus> upcoming(UUID organizationId, OffsetDateTime now, OffsetDateTime until, int limit);
}
