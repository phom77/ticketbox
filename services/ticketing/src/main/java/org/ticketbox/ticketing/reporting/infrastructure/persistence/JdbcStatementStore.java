package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
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
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
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
            SELECT s.id, s.organization_id, s.scope_type, s.scope_id, s.event_id, s.number, s.revision, s.supersedes_id,
                   s.status, s.timezone, s.cutoff_at, s.issued_at, s.issued_by, s.organization_snapshot,
                   s.scope_snapshot, s.gross_sales, s.refunds, s.net_sales, s.sale_orders, s.refund_orders,
                   s.tickets_sold, s.tickets_refunded, s.verified_collected, s.verified_refunded,
                   s.unreconciled_orders, (SELECT p.number FROM settlement_statements p WHERE p.id = s.supersedes_id) AS supersedes_number,
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

    private static String column(String scopeType) {
        return SettlementStatement.PERFORMANCE.equals(scopeType) ? "l.performance_id" : "l.event_id";
    }

    private static String ledger(String scopeType) {
        return "l.organization_id = :org AND " + column(scopeType) + " = :scope";
    }

    private static String fingerprint(long ledgerRows, long reconciliationRows, long collected, long refunded) {
        return ledgerRows + ":" + reconciliationRows + ":" + collected + ":" + refunded;
    }

    /**
     * Every statement figure comes from this one statement, so they share one snapshot and add up. The ledger rows
     * of the scope are read once ("sl"), the verified reconciliation records of their sale orders once ("rc"). The
     * fingerprint row describes exactly the rows the figures were built from.
     */
    private static String figuresSql(String scopeType) {
        boolean event = SettlementStatement.EVENT.equals(scopeType);
        String head = """
                WITH sl AS MATERIALIZED (SELECT l.* FROM sales_ledger l WHERE %s),
                     sale_orders AS (SELECT s.order_id, COALESCE(max(s.provider), 'UNKNOWN') AS provider,
                                            SUM(s.amount) AS amount
                                       FROM sl s WHERE s.kind = 'SALE' GROUP BY s.order_id),
                     rc AS MATERIALIZED (SELECT r.order_id, r.collected_amount, r.refund_amount
                                           FROM payment_reconciliation r
                                          WHERE r.verified_at IS NOT NULL
                                            AND r.order_id IN (SELECT order_id FROM sale_orders)),
                     verified_by_order AS (SELECT order_id, SUM(collected_amount) AS collected FROM rc GROUP BY order_id),
                     verified AS (SELECT so.provider, SUM(rc.collected_amount) AS collected,
                                         SUM(rc.refund_amount) AS refunded
                                    FROM rc JOIN sale_orders so ON so.order_id = rc.order_id GROUP BY so.provider),
                     sold AS (SELECT COALESCE(l.provider, 'UNKNOWN') AS provider, %s FROM sl l GROUP BY 1)
                """.formatted(ledger(scopeType), SUMS);
        String cols = "section, key, label, section_label, provider, sold, refunded, orders, gross, refunds,"
                + " refund_orders, collected, refunded_amount, aux1, aux2, ord";
        StringBuilder sql = new StringBuilder(head).append("SELECT * FROM (");
        sql.append("SELECT 'TOTAL' AS section, NULL::uuid AS key, NULL::text AS label, NULL::text AS section_label,"
                + " NULL::text AS provider, ").append(SUMS).append("""
                , 0::numeric AS collected, 0::numeric AS refunded_amount,
                  (SELECT count(*) FROM sale_orders o LEFT JOIN verified_by_order b ON b.order_id = o.order_id
                    WHERE o.amount > 0 AND o.amount IS DISTINCT FROM b.collected) AS aux1,
                  0::bigint AS aux2, NULL::timestamptz AS ord
                  FROM sl l
                """);
        sql.append(" UNION ALL SELECT 'OFFER', l.offer_id, l.offer_name, l.section_label, NULL, ").append(SUMS)
                .append(", 0, 0, 0, 0, NULL FROM sl l GROUP BY l.offer_id, l.offer_name, l.section_label");
        if (event) {
            // The Sales report's inclusion rule: sales, refunds, or a performance that is not a draft.
            sql.append(" UNION ALL SELECT 'PERFORMANCE', c.id, c.title, NULL, NULL, ").append(SUMS)
                    .append("""
                            , 0, 0, 0, 0, c.event_date
                              FROM concerts c LEFT JOIN performance_sales ps ON ps.id = c.id
                              LEFT JOIN sl l ON l.performance_id = c.id
                             WHERE c.organization_id = :org AND (c.id = :scope OR ps.event_id = :scope)
                             GROUP BY c.id, c.title, c.event_date, c.status
                            HAVING c.status <> 'DRAFT' OR count(l.order_id) > 0
                            """);
        }
        sql.append("""
                 UNION ALL SELECT 'PROVIDER', NULL, COALESCE(p.provider, v.provider), NULL,
                        COALESCE(p.provider, v.provider), COALESCE(p.sold, 0), COALESCE(p.refunded, 0),
                        COALESCE(p.orders, 0), COALESCE(p.gross, 0), COALESCE(p.refunds, 0),
                        COALESCE(p.refund_orders, 0), COALESCE(v.collected, 0), COALESCE(v.refunded, 0), 0, 0, NULL
                   FROM sold p FULL JOIN verified v ON v.provider = p.provider
                 UNION ALL SELECT 'FINGERPRINT', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0,
                        COALESCE((SELECT SUM(collected_amount) FROM rc), 0),
                        COALESCE((SELECT SUM(refund_amount) FROM rc), 0),
                        (SELECT count(*) FROM sl), (SELECT count(*) FROM rc), NULL
                ) f (""").append(cols).append(") ORDER BY section, ord, label, section_label, key");
        return sql.toString();
    }

    @Override
    public Figures figures(UUID organization, ScopeState scope) {
        var params = new MapSqlParameterSource("org", organization).addValue("scope", scope.scopeId());
        List<Line> lines = new ArrayList<>();
        long[] total = new long[6];
        long[] print = new long[4];
        int[] unreconciled = new int[1];
        int[] sort = new int[3];
        jdbc.query(figuresSql(scope.type()), params, (RowCallbackHandler) r -> {
            switch (r.getString("section")) {
                case "TOTAL" -> {
                    total[0] = r.getLong("gross");
                    total[1] = r.getLong("refunds");
                    total[2] = r.getLong("orders");
                    total[3] = r.getLong("refund_orders");
                    total[4] = r.getLong("sold");
                    total[5] = r.getLong("refunded");
                    unreconciled[0] = r.getInt("aux1");
                }
                case "PERFORMANCE" -> lines.add(line("PERFORMANCE", sort[0]++, r.getString("label"),
                        r.getObject("key", UUID.class), null, r, 0, 0));
                case "OFFER" -> {
                    String label = r.getString("label");
                    String section = r.getString("section_label");
                    String text = section == null || section.isBlank() || section.equals(label) ? label
                            : label + " - " + section;
                    lines.add(line("OFFER", sort[1]++, text, r.getObject("key", UUID.class), null, r, 0, 0));
                }
                case "PROVIDER" -> lines.add(line("PROVIDER", sort[2]++, r.getString("label"), null,
                        r.getString("provider"), r, r.getLong("collected"), r.getLong("refunded_amount")));
                default -> {
                    print[0] = r.getLong("aux1");
                    print[1] = r.getLong("aux2");
                    print[2] = r.getLong("collected");
                    print[3] = r.getLong("refunded_amount");
                }
            }
        });
        long collected = lines.stream().filter(l -> l.kind().equals("PROVIDER")).mapToLong(Line::verifiedCollected).sum();
        long refunded = lines.stream().filter(l -> l.kind().equals("PROVIDER")).mapToLong(Line::verifiedRefunded).sum();
        var totals = new Totals(total[0], total[1], total[0] - total[1], (int) total[2], (int) total[3],
                (int) total[4], (int) total[5], collected, refunded, unreconciled[0]);
        return new Figures(totals, lines, fingerprint(print[0], print[1], print[2], print[3]));
    }

    private static Line line(String kind, int sort, String label, UUID key, String provider, ResultSet r,
                             long verifiedCollected, long verifiedRefunded) throws SQLException {
        long gross = r.getLong("gross");
        long refunds = r.getLong("refunds");
        return new Line(kind, sort, label, key, provider, r.getInt("sold"), r.getInt("refunded"), gross, refunds,
                gross - refunds, verifiedCollected, verifiedRefunded, r.getInt("orders"), r.getInt("refund_orders"));
    }

    /** Per-scope aggregates through one lateral query per scope type, so list pages need no per-row queries. */
    private <T> Map<UUID, T> perScope(String type, UUID organization, Collection<UUID> ids, String select,
                                      String from, RowMapper<T> mapper) {
        Map<UUID, T> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        String sql = "SELECT s.id, " + select + " FROM unnest(?::uuid[]) AS s(id) " + from.replace("COL", column(type));
        plain.query(sql, ps -> {
            ps.setArray(1, ps.getConnection().createArrayOf("uuid", ids.toArray()));
            long placeholders = from.chars().filter(c -> c == '?').count();
            for (int i = 0; i < placeholders; i++) ps.setObject(2 + i, organization);
        }, (RowCallbackHandler) r -> out.put(r.getObject("id", UUID.class), mapper.mapRow(r, 0)));
        return out;
    }

    private Map<UUID, String> fingerprints(String type, UUID organization, Collection<UUID> ids) {
        return perScope(type, organization, ids, "led.n AS ledger_rows, rec.n AS rec_rows, rec.coll, rec.ref", """
                CROSS JOIN LATERAL (SELECT count(*) AS n FROM sales_ledger l
                                     WHERE l.organization_id = ? AND COL = s.id) led
                CROSS JOIN LATERAL (SELECT count(*) AS n, COALESCE(SUM(r.collected_amount), 0) AS coll,
                                           COALESCE(SUM(r.refund_amount), 0) AS ref
                                      FROM payment_reconciliation r
                                     WHERE r.verified_at IS NOT NULL
                                       AND r.order_id IN (SELECT l.order_id FROM sales_ledger l
                                                           WHERE l.organization_id = ? AND COL = s.id
                                                             AND l.kind = 'SALE')) rec
                """, (r, n) -> fingerprint(r.getLong("ledger_rows"), r.getLong("rec_rows"), r.getLong("coll"),
                r.getLong("ref")));
    }

    @Override
    public Map<String, long[]> netToDate(UUID organization, Collection<ScopeState> scopes) {
        Map<String, long[]> out = new HashMap<>();
        for (String type : List.of(SettlementStatement.PERFORMANCE, SettlementStatement.EVENT)) {
            var ids = scopes.stream().filter(s -> s.type().equals(type)).map(ScopeState::scopeId).distinct().toList();
            perScope(type, organization, ids, "agg.*", "CROSS JOIN LATERAL (SELECT " + SUMS
                    + " FROM sales_ledger l WHERE l.organization_id = ? AND COL = s.id) agg", (r, n) -> new long[] {
                    r.getLong("gross") - r.getLong("refunds"), r.getLong("sold") - r.getLong("refunded")})
                    .forEach((id, net) -> out.put(type + ":" + id, net));
        }
        return out;
    }

    @Override
    public Set<UUID> outOfDate(Collection<SettlementStatement> statements) {
        Set<UUID> stale = new HashSet<>();
        if (statements.isEmpty()) return stale;
        Map<UUID, String> stored = new HashMap<>();
        plain.query("SELECT id, fingerprint FROM settlement_statements WHERE id = ANY(?)", ps -> ps.setArray(1,
                ps.getConnection().createArrayOf("uuid", statements.stream().map(SettlementStatement::id).toArray())),
                (RowCallbackHandler) r -> stored.put(r.getObject("id", UUID.class), r.getString("fingerprint")));
        for (String type : List.of(SettlementStatement.PERFORMANCE, SettlementStatement.EVENT)) {
            var ofType = statements.stream().filter(s -> s.scopeType().equals(type)).toList();
            if (ofType.isEmpty()) continue;
            UUID org = ofType.get(0).organizationId();
            var now = fingerprints(type, org, ofType.stream().map(SettlementStatement::scopeId).distinct().toList());
            ofType.forEach(s -> {
                if (!Objects.equals(stored.get(s.id()), now.get(s.scopeId()))) stale.add(s.id());
            });
        }
        return stale;
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
    public void insert(SettlementStatement s, byte[] pdf, String pdfSha256, String fingerprint) {
        var t = s.totals();
        try {
            plain.update("""
                    INSERT INTO settlement_statements (id, organization_id, scope_type, scope_id, event_id, number,
                        revision, supersedes_id, status, timezone, cutoff_at, issued_at, issued_by,
                        organization_snapshot, scope_snapshot, gross_sales, refunds, net_sales, sale_orders,
                        refund_orders, tickets_sold, tickets_refunded, verified_collected, verified_refunded,
                        unreconciled_orders, pdf, pdf_sha256, fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CURRENT', ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?)
                    """, s.id(), s.organizationId(), s.scopeType(), s.scopeId(), s.eventId(), s.number(), s.revision(),
                    s.supersedesId(), s.timezone(), s.cutoffAt(), s.issuedAt(), s.issuedBy(),
                    json.writeValueAsString(s.organization()), json.writeValueAsString(s.scope()), t.grossSales(),
                    t.refunds(), t.netSales(), t.saleOrders(), t.refundOrders(), t.ticketsSold(), t.ticketsRefunded(),
                    t.verifiedCollected(), t.verifiedRefunded(), t.unreconciledOrders(), pdf, pdfSha256, fingerprint);
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
                    List.of(), false, false);
        } catch (JsonProcessingException e) {
            throw new SQLException(e);
        }
    }
}
