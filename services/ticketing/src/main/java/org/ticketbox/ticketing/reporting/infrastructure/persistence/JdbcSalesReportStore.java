package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.reporting.application.port.SalesReportStore;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JdbcSalesReportStore implements SalesReportStore {
    static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private static final String SUMS = """
            COALESCE(SUM(l.quantity) FILTER (WHERE l.kind = 'SALE'), 0) AS sold,
            COALESCE(SUM(l.quantity) FILTER (WHERE l.kind = 'REFUND'), 0) AS refunded,
            COUNT(DISTINCT l.order_id) FILTER (WHERE l.kind = 'SALE') AS orders,
            COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'SALE'), 0) AS gross,
            COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'REFUND'), 0) AS refunds
            """;
    /**
     * A performance is final once it is completed, or its end (native) or event date plus one day (legacy) has passed.
     * A cancelled performance stays provisional while paid orders still await their refund.
     */
    private static final String ENDED = """
            (c.status = 'COMPLETED'
             OR (c.status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM orders po WHERE po.concert_id = c.id AND po.status = 'PAID'))
             OR (c.status <> 'CANCELLED' AND COALESCE(ps.ends_at, c.event_date + interval '1 day') <= now()))""";
    /** Performances of one event: a legacy concert is its own event. */
    private static final String EVENT_MATCH = "(c.id = :event OR ps.event_id = :event)";

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcSalesReportStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<ScopeInfo> resolve(Scope scope) {
        if (scope.performanceId() == null && scope.eventId() == null) {
            return Optional.of(new ScopeInfo(null, DEFAULT_ZONE));
        }
        var params = new MapSqlParameterSource("org", scope.organizationId());
        String where;
        if (scope.performanceId() != null) {
            params.addValue("perf", scope.performanceId());
            where = "c.id = :perf";
            if (scope.eventId() != null) {
                params.addValue("event", scope.eventId());
                where += " AND COALESCE(ps.event_id, c.id) = :event";
            }
        } else {
            params.addValue("event", scope.eventId());
            where = EVENT_MATCH;
        }
        var rows = jdbc.query("""
                SELECT c.title, ps.timezone FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE c.organization_id = :org AND %s ORDER BY c.event_date, c.id LIMIT 1
                """.formatted(where), params, (r, n) -> new ScopeInfo(r.getString("title"),
                scope.performanceId() != null && r.getString("timezone") != null
                        ? ZoneId.of(r.getString("timezone")) : DEFAULT_ZONE));
        return rows.stream().findFirst();
    }

    @Override
    public Figures totals(Scope scope, OffsetDateTime from, OffsetDateTime to) {
        return jdbc.queryForObject("SELECT " + SUMS + " FROM sales_ledger l WHERE " + ledgerWhere(scope),
                period(scope, from, to), (r, n) -> figures(r));
    }

    @Override
    public List<Bucket> trend(Scope scope, OffsetDateTime from, OffsetDateTime to, ZoneId zone, String unit) {
        if (!List.of("hour", "day", "week").contains(unit)) {
            throw new IllegalArgumentException(unit);
        }
        return jdbc.query("SELECT date_trunc('" + unit + "', l.occurred_at AT TIME ZONE :zone) AS bucket, " + SUMS
                        + " FROM sales_ledger l WHERE " + ledgerWhere(scope) + " GROUP BY 1 ORDER BY 1",
                period(scope, from, to).addValue("zone", zone.getId()),
                (r, n) -> new Bucket(r.getObject("bucket", LocalDateTime.class), figures(r)));
    }

    @Override
    public List<BreakdownRow> byPerformance(Scope scope, OffsetDateTime from, OffsetDateTime to) {
        var params = period(scope, from, to);
        String filter;
        if (scope.performanceId() != null) {
            filter = "c.id = :perf AND (agg.sold > 0 OR agg.refunded > 0 OR c.status <> 'DRAFT')";
        } else if (scope.eventId() != null) {
            filter = EVENT_MATCH + " AND (agg.sold > 0 OR agg.refunded > 0 OR c.status <> 'DRAFT')";
        } else {
            filter = "(agg.sold > 0 OR agg.refunded > 0)";
        }
        return jdbc.query("""
                SELECT c.id AS performance_id, COALESCE(ps.event_id, c.id) AS event_id, c.title, c.event_date,
                       NOT %s AS provisional, agg.*
                  FROM concerts c
                  LEFT JOIN performance_sales ps ON ps.id = c.id
                  CROSS JOIN LATERAL (SELECT %s FROM sales_ledger l WHERE l.performance_id = c.id AND %s) agg
                 WHERE c.organization_id = :org AND %s
                 ORDER BY c.event_date, c.id LIMIT 500
                """.formatted(ENDED, SUMS, rangeWhere(), filter), params,
                (r, n) -> new BreakdownRow(r.getObject("performance_id", UUID.class),
                        r.getObject("performance_id", UUID.class), r.getObject("event_id", UUID.class),
                        r.getString("title"), null, null, r.getObject("event_date", OffsetDateTime.class),
                        r.getBoolean("provisional"), figures(r)));
    }

    @Override
    public List<BreakdownRow> byOffer(Scope scope, OffsetDateTime from, OffsetDateTime to) {
        return jdbc.query("""
                SELECT l.performance_id, l.offer_id, max(l.event_id::text)::uuid AS event_id, max(l.offer_name) AS offer_name,
                       max(l.section_label) AS section_label, max(c.title) AS title, max(c.event_date) AS event_date,
                       NOT bool_and(%s) AS provisional, %s
                  FROM sales_ledger l
                  JOIN concerts c ON c.id = l.performance_id
                  LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE %s
                 GROUP BY l.performance_id, l.offer_id
                 ORDER BY max(c.event_date), l.performance_id, COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'SALE'), 0) DESC, l.offer_id
                 LIMIT 500
                """.formatted(ENDED, SUMS, ledgerWhere(scope)), period(scope, from, to),
                (r, n) -> new BreakdownRow(r.getObject("offer_id", UUID.class),
                        r.getObject("performance_id", UUID.class), r.getObject("event_id", UUID.class),
                        r.getString("offer_name"), r.getString("section_label"), r.getString("title"),
                        r.getObject("event_date", OffsetDateTime.class), r.getBoolean("provisional"), figures(r)));
    }

    @Override
    public boolean provisional(Scope scope, OffsetDateTime from, OffsetDateTime to) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM sales_ledger l
                                 JOIN concerts c ON c.id = l.performance_id
                                 LEFT JOIN performance_sales ps ON ps.id = c.id
                                WHERE %s AND NOT %s)
                """.formatted(ledgerWhere(scope), ENDED), period(scope, from, to), Boolean.class));
    }

    @Override
    public List<UUID> performanceIds(Scope scope) {
        if (scope.performanceId() != null) {
            return List.of(scope.performanceId());
        }
        if (scope.eventId() == null) {
            return List.of();
        }
        return jdbc.queryForList("""
                SELECT c.id FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE c.organization_id = :org AND %s AND c.status NOT IN ('DRAFT', 'CANCELLED')
                """.formatted(EVENT_MATCH), new MapSqlParameterSource("org", scope.organizationId())
                .addValue("event", scope.eventId()), UUID.class);
    }

    @Override
    public Map<UUID, Long> capacities(Collection<UUID> ids) {
        Map<UUID, Long> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        jdbc.query("""
                SELECT c.id,
                       COALESCE(
                         (SELECT SUM(CASE WHEN g.kind = 'GA' THEN g.capacity
                                          ELSE (SELECT count(*) FROM performance_seats s
                                                 WHERE s.performance_id = g.performance_id AND s.group_id = g.id
                                                   AND s.status <> 'BLOCKED') END)
                            FROM performance_groups g WHERE g.performance_id = c.id),
                         (SELECT SUM(ti.total_quantity) FROM ticket_types tt
                            JOIN ticket_inventory ti ON ti.ticket_type_id = tt.id
                           WHERE tt.concert_id = c.id AND NOT tt.performance_offer AND ti.active), 0) AS capacity
                  FROM concerts c WHERE c.id IN (:ids)
                """, new MapSqlParameterSource("ids", ids),
                (org.springframework.jdbc.core.RowCallbackHandler) r ->
                        result.put(r.getObject("id", UUID.class), r.getLong("capacity")));
        return result;
    }

    @Override
    public Map<UUID, Long> netTickets(UUID organizationId, Collection<UUID> ids) {
        Map<UUID, Long> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        jdbc.query("""
                SELECT performance_id, SUM(CASE kind WHEN 'SALE' THEN quantity ELSE -quantity END) AS net
                  FROM sales_ledger WHERE organization_id = :org AND performance_id IN (:ids)
                 GROUP BY performance_id
                """, new MapSqlParameterSource("org", organizationId).addValue("ids", ids),
                (org.springframework.jdbc.core.RowCallbackHandler) r ->
                        result.put(r.getObject("performance_id", UUID.class), r.getLong("net")));
        return result;
    }

    @Override
    public List<PerformanceStatus> onSale(UUID organizationId, OffsetDateTime now, int limit) {
        return statuses(organizationId, """
                c.status IN ('ON_SALE', 'SOLD_OUT') AND NOT COALESCE(c.sales_suspended, false) AND c.sale_start_at <= :now
                AND (c.sale_end_at IS NULL OR c.sale_end_at > :now) AND COALESCE(ps.ends_at, c.event_date) > :now
                """, new MapSqlParameterSource("now", now), limit);
    }

    @Override
    public List<PerformanceStatus> upcoming(UUID organizationId, OffsetDateTime now, OffsetDateTime until, int limit) {
        return statuses(organizationId, """
                c.status NOT IN ('DRAFT','CANCELLED') AND c.event_date >= :now AND c.event_date < :until
                """, new MapSqlParameterSource("now", now).addValue("until", until), limit);
    }

    @Override
    public List<EventOption> events(UUID organizationId, String search, int offset, int limit) {
        String pattern = "%" + (search == null ? "" : search.strip().replace("\\", "\\\\").replace("%", "\\%")
                .replace("_", "\\_")) + "%";
        var params = new MapSqlParameterSource("org", organizationId).addValue("pattern", pattern)
                .addValue("offset", offset).addValue("limit", limit);
        var events = jdbc.query("""
                SELECT COALESCE(ps.event_id, c.id) AS event_id,
                       (array_agg(c.title ORDER BY c.event_date, c.id))[1] AS title
                  FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE c.organization_id = :org AND c.status <> 'DRAFT' AND c.title ILIKE :pattern
                 GROUP BY 1 ORDER BY max(c.event_date) DESC, 1 LIMIT :limit OFFSET :offset
                """, params, (r, n) -> new UUID[] {r.getObject("event_id", UUID.class)}).stream()
                .map(row -> row[0]).toList();
        if (events.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<PerformanceOption>> performances = new HashMap<>();
        Map<UUID, String> titles = new HashMap<>();
        jdbc.query("""
                SELECT c.id, COALESCE(ps.event_id, c.id) AS event_id, c.title, c.event_date, ps.timezone
                  FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE c.organization_id = :org AND c.status <> 'DRAFT' AND COALESCE(ps.event_id, c.id) IN (:events)
                 ORDER BY c.event_date, c.id
                """, new MapSqlParameterSource("org", organizationId).addValue("events", events),
                (org.springframework.jdbc.core.RowCallbackHandler) r -> {
                    UUID event = r.getObject("event_id", UUID.class);
                    titles.putIfAbsent(event, r.getString("title"));
                    performances.computeIfAbsent(event, k -> new java.util.ArrayList<>()).add(new PerformanceOption(
                            r.getObject("id", UUID.class), r.getString("title"),
                            r.getObject("event_date", OffsetDateTime.class),
                            r.getString("timezone") == null ? DEFAULT_ZONE.getId() : r.getString("timezone")));
                });
        return events.stream().map(id -> new EventOption(id, titles.get(id), performances.get(id))).toList();
    }

    private List<PerformanceStatus> statuses(UUID organizationId, String condition, MapSqlParameterSource params,
            int limit) {
        params.addValue("org", organizationId).addValue("limit", limit);
        var rows = jdbc.query("""
                SELECT c.id, COALESCE(ps.event_id, c.id) AS event_id, c.title, c.event_date
                  FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                 WHERE c.organization_id = :org AND %s ORDER BY c.event_date, c.id LIMIT :limit
                """.formatted(condition), params, (r, n) -> new Object[] {r.getObject("id", UUID.class),
                r.getObject("event_id", UUID.class), r.getString("title"), r.getObject("event_date", OffsetDateTime.class)});
        var ids = rows.stream().map(row -> (UUID) row[0]).toList();
        var capacity = capacities(ids);
        var net = netTickets(organizationId, ids);
        return rows.stream().map(row -> new PerformanceStatus((UUID) row[0], (UUID) row[1], (String) row[2],
                (OffsetDateTime) row[3], net.getOrDefault((UUID) row[0], 0L), capacity.get((UUID) row[0]))).toList();
    }

    private static String ledgerWhere(Scope scope) {
        String where = "l.organization_id = :org AND " + rangeWhere();
        if (scope.performanceId() != null) {
            return where + " AND l.performance_id = :perf";
        }
        return scope.eventId() != null ? where + " AND l.event_id = :event" : where;
    }

    private static String rangeWhere() {
        return "l.occurred_at >= :from AND l.occurred_at < :to";
    }

    private static MapSqlParameterSource period(Scope scope, OffsetDateTime from, OffsetDateTime to) {
        return new MapSqlParameterSource("org", scope.organizationId()).addValue("from", from).addValue("to", to)
                .addValue("event", scope.eventId()).addValue("perf", scope.performanceId());
    }

    private static Figures figures(ResultSet r) throws SQLException {
        return new Figures(r.getLong("sold"), r.getLong("refunded"), r.getLong("orders"), r.getLong("gross"),
                r.getLong("refunds"));
    }
}
