package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.reporting.application.port.StatementStore;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.Line;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.OrganizationDetails;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.ScopeDetails;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.Totals;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcStatementStore implements StatementStore {
    /** Ledger sums plus the number of refunded orders. */
    private static final String SUMS = JdbcSalesReportStore.SUMS
            + ", COUNT(DISTINCT l.order_id) FILTER (WHERE l.kind = 'REFUND') AS refund_orders";

    private static final String SCOPE_ROWS = """
            SELECT c.id, COALESCE(ps.event_id, c.id) AS event_id, c.title, c.venue_name, c.event_date, ps.ends_at,
                   ps.timezone, (%s) AS final,
                   (c.status = 'CANCELLED' AND EXISTS (SELECT 1 FROM orders po WHERE po.concert_id = c.id
                                                         AND po.status = 'PAID')) AS refunds_pending
              FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
             WHERE c.organization_id = :org AND c.status <> 'DRAFT' AND %s
             ORDER BY c.event_date, c.id
            """;

    private static final String HEADER = """
            SELECT s.*, (SELECT p.number FROM settlement_statements p WHERE p.id = s.supersedes_id) AS supersedes_number,
                   (SELECT n.number FROM settlement_statements n WHERE n.supersedes_id = s.id) AS superseded_by_number
              FROM settlement_statements s
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final JdbcTemplate plain;
    private final ObjectMapper json;

    JdbcStatementStore(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.plain = jdbc.getJdbcTemplate();
        this.json = json;
    }

    private record Row(UUID id, UUID eventId, String title, String venue, OffsetDateTime startsAt, OffsetDateTime endsAt,
                       String timezone, boolean isFinal, boolean refundsPending) {}

    private List<Row> rows(MapSqlParameterSource params, String where) {
        return jdbc.query(SCOPE_ROWS.formatted(JdbcSalesReportStore.ENDED, where), params, (r, n) -> new Row(
                r.getObject("id", UUID.class), r.getObject("event_id", UUID.class), r.getString("title"),
                r.getString("venue_name"), r.getObject("event_date", OffsetDateTime.class),
                r.getObject("ends_at", OffsetDateTime.class), r.getString("timezone"), r.getBoolean("final"),
                r.getBoolean("refunds_pending")));
    }

    @Override
    public Optional<ScopeState> scope(UUID organization, String type, UUID scopeId) {
        var params = new MapSqlParameterSource("org", organization).addValue("scope", scopeId);
        boolean performance = SettlementStatement.PERFORMANCE.equals(type);
        var rows = rows(params, performance ? "c.id = :scope" : JdbcSalesReportStore.EVENT_MATCH.replace(":event", ":scope"));
        if (rows.isEmpty()) return Optional.empty();
        return Optional.of(performance ? performance(rows.get(0)) : event(scopeId, rows));
    }

    private static ScopeState performance(Row row) {
        OffsetDateTime end = row.endsAt() != null ? row.endsAt() : row.startsAt();
        return new ScopeState(SettlementStatement.PERFORMANCE, row.id(), row.eventId(), row.title(), row.title(),
                row.venue(), row.startsAt(), end, row.timezone() == null ? null : ZoneId.of(row.timezone()), 1,
                row.isFinal(), row.refundsPending());
    }

    private static ScopeState event(UUID eventId, List<Row> rows) {
        var first = rows.get(0);
        OffsetDateTime end = rows.stream().map(r -> r.endsAt() != null ? r.endsAt() : r.startsAt())
                .max(Comparator.naturalOrder()).orElse(first.startsAt());
        return new ScopeState(SettlementStatement.EVENT, eventId, eventId, first.title(), first.title(), first.venue(),
                first.startsAt(), end, null, rows.size(), rows.stream().allMatch(Row::isFinal),
                rows.stream().anyMatch(Row::refundsPending));
    }

    @Override
    public List<ScopeState> candidates(UUID organization, String search) {
        String text = search == null ? "" : search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        var params = new MapSqlParameterSource("org", organization).addValue("pattern", "%" + text + "%");
        var rows = rows(params, "c.title ILIKE :pattern");
        List<ScopeState> out = new ArrayList<>();
        Map<UUID, List<Row>> byEvent = new LinkedHashMap<>();
        rows.forEach(row -> {
            out.add(performance(row));
            byEvent.computeIfAbsent(row.eventId(), k -> new ArrayList<>()).add(row);
        });
        byEvent.forEach((event, list) -> {
            if (list.size() > 1) out.add(event(event, list));
        });
        return out;
    }

    private static String ledger(String scopeType) {
        return "l.organization_id = :org AND " + (SettlementStatement.PERFORMANCE.equals(scopeType)
                ? "l.performance_id = :scope" : "l.event_id = :scope");
    }

    @Override
    public Figures figures(UUID organization, ScopeState scope, OffsetDateTime cutoff) {
        var params = new MapSqlParameterSource("org", organization).addValue("scope", scope.scopeId())
                .addValue("cutoff", cutoff);
        String where = ledger(scope.type()) + " AND l.recorded_at <= :cutoff";
        List<Line> lines = new ArrayList<>();
        if (SettlementStatement.EVENT.equals(scope.type())) {
            int[] sort = {0};
            lines.addAll(jdbc.query("SELECT c.id AS key, c.title AS label, " + SUMS + """
                      FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                      LEFT JOIN sales_ledger l ON l.performance_id = c.id AND l.organization_id = :org
                           AND l.recorded_at <= :cutoff
                     WHERE c.organization_id = :org AND c.status <> 'DRAFT' AND (c.id = :scope OR ps.event_id = :scope)
                     GROUP BY c.id, c.title, c.event_date ORDER BY c.event_date, c.id
                    """, params, (r, n) -> line("PERFORMANCE", sort[0]++, r.getString("label"),
                    r.getObject("key", UUID.class), null, r)));
        }
        int[] sort = {0};
        lines.addAll(jdbc.query("SELECT l.offer_id AS key, l.offer_name AS label, l.section_label, " + SUMS
                + " FROM sales_ledger l WHERE " + where
                + " GROUP BY l.offer_id, l.offer_name, l.section_label ORDER BY l.offer_name, l.section_label, l.offer_id",
                params, (r, n) -> {
                    String section = r.getString("section_label");
                    String label = section == null || section.isBlank() || section.equals(r.getString("label"))
                            ? r.getString("label") : r.getString("label") + " - " + section;
                    return line("OFFER", sort[0]++, label, r.getObject("key", UUID.class), null, r);
                }));
        Map<String, long[]> verified = new LinkedHashMap<>();
        jdbc.query("""
                SELECT r.provider, COALESCE(SUM(r.collected_amount), 0) AS collected,
                       COALESCE(SUM(r.refund_amount), 0) AS refunded
                  FROM payment_reconciliation r
                 WHERE r.verified_at IS NOT NULL AND r.received_at <= :cutoff
                   AND r.order_id IN (SELECT l.order_id FROM sales_ledger l WHERE""" + " " + where + """

                           AND l.kind = 'SALE')
                 GROUP BY r.provider
                """, params, (RowCallbackHandler) r ->
                verified.put(r.getString("provider"), new long[] {r.getLong("collected"), r.getLong("refunded")}));
        Map<String, Line> providers = new LinkedHashMap<>();
        jdbc.query("SELECT COALESCE(l.provider, 'UNKNOWN') AS provider, " + SUMS + " FROM sales_ledger l WHERE " + where
                + " GROUP BY 1 ORDER BY 1", params, (RowCallbackHandler) r ->
                providers.put(r.getString("provider"), line("PROVIDER", 0, r.getString("provider"), null,
                        r.getString("provider"), r)));
        verified.keySet().forEach(provider -> providers.computeIfAbsent(provider, p -> new Line("PROVIDER", 0, p, null,
                p, 0, 0, 0, 0, 0, 0, 0, 0, 0)));
        int order = 0;
        long collected = 0;
        long refunded = 0;
        for (var entry : providers.entrySet()) {
            long[] v = verified.getOrDefault(entry.getKey(), new long[2]);
            var l = entry.getValue();
            collected += v[0];
            refunded += v[1];
            lines.add(new Line("PROVIDER", order++, l.label(), null, l.provider(), l.ticketsSold(),
                    l.ticketsRefunded(), l.grossSales(), l.refunds(), l.netSales(), v[0], v[1], l.saleOrders(),
                    l.refundOrders()));
        }
        var totals = jdbc.queryForObject("SELECT " + SUMS + " FROM sales_ledger l WHERE " + where, params,
                (r, n) -> new long[] {r.getLong("gross"), r.getLong("refunds"), r.getLong("orders"),
                        r.getLong("refund_orders"), r.getLong("sold"), r.getLong("refunded")});
        int unreconciled = jdbc.queryForObject("""
                SELECT count(*) FROM (SELECT l.order_id, SUM(l.amount) AS amount FROM sales_ledger l WHERE""" + " " + where + """

                        AND l.kind = 'SALE' GROUP BY l.order_id) o
                 WHERE o.amount > 0 AND o.amount IS DISTINCT FROM (SELECT SUM(r.collected_amount)
                         FROM payment_reconciliation r WHERE r.order_id = o.order_id AND r.verified_at IS NOT NULL
                          AND r.received_at <= :cutoff)
                """, params, Integer.class);
        return new Figures(new Totals(totals[0], totals[1], totals[0] - totals[1], (int) totals[2], (int) totals[3],
                (int) totals[4], (int) totals[5], collected, refunded, unreconciled), lines);
    }

    private static Line line(String kind, int sort, String label, UUID key, String provider, ResultSet r)
            throws SQLException {
        long gross = r.getLong("gross");
        long refunds = r.getLong("refunds");
        return new Line(kind, sort, label, key, provider, r.getInt("sold"), r.getInt("refunded"), gross, refunds,
                gross - refunds, 0, 0, r.getInt("orders"), r.getInt("refund_orders"));
    }

    @Override
    public long[] netToDate(UUID organization, ScopeState scope) {
        var params = new MapSqlParameterSource("org", organization).addValue("scope", scope.scopeId());
        return jdbc.queryForObject("SELECT " + SUMS + " FROM sales_ledger l WHERE " + ledger(scope.type()), params,
                (r, n) -> new long[] {r.getLong("gross") - r.getLong("refunds"), r.getLong("sold") - r.getLong("refunded")});
    }

    @Override
    public boolean outOfDate(SettlementStatement statement) {
        var params = new MapSqlParameterSource("org", statement.organizationId()).addValue("scope", statement.scopeId())
                .addValue("cutoff", statement.cutoffAt());
        String where = ledger(statement.scopeType());
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM sales_ledger l WHERE " + where
                + " AND l.recorded_at > :cutoff) OR EXISTS (SELECT 1 FROM payment_reconciliation r WHERE r.received_at > :cutoff"
                + " AND r.order_id IN (SELECT l.order_id FROM sales_ledger l WHERE " + where + " AND l.kind = 'SALE'))",
                params, Boolean.class));
    }

    @Override
    public void lock(UUID organization, String type, UUID scopeId) {
        plain.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text",
                String.class, organization + ":" + type + ":" + scopeId);
    }

    @Override
    public OffsetDateTime now() {
        return plain.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class);
    }

    @Override
    public Optional<SettlementStatement> current(UUID organization, String type, UUID scopeId) {
        return plain.query(HEADER + " WHERE s.organization_id = ? AND s.scope_type = ? AND s.scope_id = ?"
                + " AND s.status = 'CURRENT'", (r, n) -> header(r), organization, type, scopeId).stream().findFirst();
    }

    @Override
    public List<SettlementStatement> currentStatements(UUID organization) {
        return plain.query(HEADER + " WHERE s.organization_id = ? AND s.status = 'CURRENT'", (r, n) -> header(r),
                organization);
    }

    @Override
    public Optional<SettlementStatement> find(UUID organization, UUID id) {
        return plain.query(HEADER + " WHERE s.organization_id = ? AND s.id = ?", (r, n) -> header(r), organization, id)
                .stream().findFirst().map(s -> s.withLines(plain.query("""
                        SELECT * FROM settlement_statement_lines WHERE statement_id = ?
                         ORDER BY CASE kind WHEN 'PERFORMANCE' THEN 0 WHEN 'OFFER' THEN 1 ELSE 2 END, sort
                        """, (r, n) -> new Line(r.getString("kind"), r.getInt("sort"), r.getString("label"),
                        r.getObject("key", UUID.class), r.getString("provider"), r.getInt("tickets_sold"),
                        r.getInt("tickets_refunded"), r.getLong("gross_sales"), r.getLong("refunds"),
                        r.getLong("net_sales"), r.getLong("verified_collected"), r.getLong("verified_refunded"),
                        r.getInt("sale_orders"), r.getInt("refund_orders")), id)));
    }

    @Override
    public Optional<byte[]> pdf(UUID organization, UUID id) {
        return plain.query("SELECT pdf FROM settlement_statements WHERE organization_id = ? AND id = ?",
                (r, n) -> r.getBytes("pdf"), organization, id).stream().findFirst();
    }

    @Override
    public long nextSequence() {
        return plain.queryForObject("SELECT nextval('settlement_statement_number_seq')", Long.class);
    }

    @Override
    public void supersede(UUID statementId) {
        plain.update("UPDATE settlement_statements SET status = 'SUPERSEDED' WHERE id = ?", statementId);
    }

    @Override
    public void insert(SettlementStatement s, byte[] pdf, String pdfSha256) {
        var t = s.totals();
        try {
            plain.update("""
                    INSERT INTO settlement_statements (id, organization_id, scope_type, scope_id, event_id, number,
                        revision, supersedes_id, status, timezone, cutoff_at, issued_at, issued_by,
                        organization_snapshot, scope_snapshot, gross_sales, refunds, net_sales, sale_orders,
                        refund_orders, tickets_sold, tickets_refunded, verified_collected, verified_refunded,
                        unreconciled_orders, pdf, pdf_sha256)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CURRENT', ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?)
                    """, s.id(), s.organizationId(), s.scopeType(), s.scopeId(), s.eventId(), s.number(), s.revision(),
                    s.supersedesId(), s.timezone(), s.cutoffAt(), s.issuedAt(), s.issuedBy(),
                    json.writeValueAsString(s.organization()), json.writeValueAsString(s.scope()), t.grossSales(),
                    t.refunds(), t.netSales(), t.saleOrders(), t.refundOrders(), t.ticketsSold(), t.ticketsRefunded(),
                    t.verifiedCollected(), t.verifiedRefunded(), t.unreconciledOrders(), pdf, pdfSha256);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        plain.batchUpdate("""
                INSERT INTO settlement_statement_lines (statement_id, kind, sort, label, key, provider, tickets_sold,
                    tickets_refunded, gross_sales, refunds, net_sales, verified_collected, verified_refunded,
                    sale_orders, refund_orders)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, s.lines(), s.lines().size(), (ps, l) -> {
            ps.setObject(1, s.id());
            ps.setString(2, l.kind());
            ps.setInt(3, l.sort());
            ps.setString(4, l.label());
            ps.setObject(5, l.key());
            ps.setString(6, l.provider());
            ps.setInt(7, l.ticketsSold());
            ps.setInt(8, l.ticketsRefunded());
            ps.setLong(9, l.grossSales());
            ps.setLong(10, l.refunds());
            ps.setLong(11, l.netSales());
            ps.setLong(12, l.verifiedCollected());
            ps.setLong(13, l.verifiedRefunded());
            ps.setInt(14, l.saleOrders());
            ps.setInt(15, l.refundOrders());
        });
    }

    @Override
    public List<SettlementStatement> list(UUID organization, UUID eventId, int offset, int limit) {
        return plain.query(HEADER + " WHERE s.organization_id = ? AND (?::uuid IS NULL OR s.event_id = ?::uuid)"
                + " ORDER BY s.issued_at DESC, s.id LIMIT ? OFFSET ?", (r, n) -> header(r), organization, eventId,
                eventId, limit, offset);
    }

    private SettlementStatement header(ResultSet r) throws SQLException {
        try {
            return new SettlementStatement(r.getObject("id", UUID.class), r.getObject("organization_id", UUID.class),
                    r.getString("scope_type"), r.getObject("scope_id", UUID.class), r.getObject("event_id", UUID.class),
                    r.getString("number"), r.getInt("revision"), r.getObject("supersedes_id", UUID.class),
                    r.getString("supersedes_number"), r.getString("superseded_by_number"), r.getString("status"),
                    r.getString("timezone"), r.getObject("cutoff_at", OffsetDateTime.class),
                    r.getObject("issued_at", OffsetDateTime.class), r.getObject("issued_by", UUID.class),
                    json.readValue(r.getString("organization_snapshot"), OrganizationDetails.class),
                    json.readValue(r.getString("scope_snapshot"), ScopeDetails.class),
                    new Totals(r.getLong("gross_sales"), r.getLong("refunds"), r.getLong("net_sales"),
                            r.getInt("sale_orders"), r.getInt("refund_orders"), r.getInt("tickets_sold"),
                            r.getInt("tickets_refunded"), r.getLong("verified_collected"),
                            r.getLong("verified_refunded"), r.getInt("unreconciled_orders")),
                    List.of(), false);
        } catch (JsonProcessingException e) {
            throw new SQLException(e);
        }
    }
}
