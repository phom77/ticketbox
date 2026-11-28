package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SimplePropertySqlParameterSource;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

@Repository
class JdbcReconciliationStore implements ReconciliationStore {
    /**
     * Intents are filtered by organization (and, on the attempt basis, by period) before they are joined to the
     * Payment snapshots, so the indexed intent columns do the work. Only the platform's unattributed view needs the
     * FULL JOIN, because it also lists snapshots that match no intent.
     */
    private static final String SELECT = """
            SELECT coalesce(p.intent_id, i.intent_id) AS intent_id,
                   coalesce(p.order_id, i.order_id) AS order_id, o.organization_id, o.concert_id,
                   o.reference_code, c.title AS concert_title, coalesce(p.provider, i.provider) AS provider,
                   coalesce(p.state, 'PENDING_REPORT') AS payment_state,
                   o.status AS order_status, coalesce(p.requested_amount, i.amount) AS requested_amount,
                   CASE WHEN o.status = 'PAID' THEN o.total_amount ELSE 0 END AS sales_amount,
                   p.transaction_id, p.collected_amount, coalesce(i.effective_at, p.attempted_at) AS attempted_at,
                   p.verified_at, p.refund_amount, p.refund_reference, p.changed_at, p.received_at
            """;
    private static final String JOINS = """
              LEFT JOIN orders o ON o.id = i.order_id
              LEFT JOIN concerts c ON c.id = o.concert_id
            """;
    private static final RowMapper<Row> ROW = (r, n) -> new Row(
            r.getObject("intent_id", UUID.class), r.getObject("order_id", UUID.class),
            r.getObject("organization_id", UUID.class), r.getObject("concert_id", UUID.class),
            r.getString("concert_title"), r.getString("provider"), r.getString("payment_state"),
            r.getString("order_status"), r.getLong("requested_amount"), r.getString("transaction_id"),
            amount(r, "collected_amount"), r.getObject("attempted_at", OffsetDateTime.class),
            r.getObject("verified_at", OffsetDateTime.class), amount(r, "refund_amount"),
            r.getString("refund_reference"), r.getObject("changed_at", OffsetDateTime.class),
            r.getObject("received_at", OffsetDateTime.class), r.getString("reference_code"));

    private final NamedParameterJdbcTemplate jdbc;

    JdbcReconciliationStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void apply(Snapshot s) {
        jdbc.update("""
                INSERT INTO payment_reconciliation(intent_id, order_id, revision, provider, state,
                    requested_amount, transaction_id, collected_amount, attempted_at, verified_at,
                    refund_amount, refund_reference, changed_at)
                VALUES (:intentId, :orderId, :revision, :provider, :state, :requestedAmount,
                    :transactionId, :collectedAmount, :attemptedAt, :verifiedAt, :refundAmount,
                    :refundReference, :changedAt)
                ON CONFLICT (intent_id) DO UPDATE SET
                    revision = excluded.revision, state = excluded.state, transaction_id = excluded.transaction_id,
                    collected_amount = excluded.collected_amount, verified_at = excluded.verified_at,
                    refund_amount = excluded.refund_amount, refund_reference = excluded.refund_reference,
                    changed_at = excluded.changed_at, received_at = clock_timestamp()
                WHERE payment_reconciliation.revision < excluded.revision
                  AND payment_reconciliation.order_id = excluded.order_id
                  AND payment_reconciliation.provider = excluded.provider
                  AND payment_reconciliation.requested_amount = excluded.requested_amount
                  AND payment_reconciliation.attempted_at = excluded.attempted_at
                """, new SimplePropertySqlParameterSource(s));
        jdbc.update("""
                UPDATE ticketing_payment_intents i SET effective_at = p.attempted_at
                  FROM payment_reconciliation p
                 WHERE i.intent_id = :intentId AND p.intent_id = i.intent_id AND p.order_id = i.order_id
                   AND p.provider = i.provider AND p.requested_amount = i.amount
                   AND i.effective_at <> p.attempted_at
                """, new SimplePropertySqlParameterSource(s));
    }

    @Override
    public Totals totals(Filter filter) {
        return jdbc.queryForObject("""
                SELECT count(*) AS rows, coalesce(sum(sales_amount), 0) AS sales,
                       coalesce(sum(collected_amount), 0) AS collected,
                       count(*) FILTER (WHERE received_at IS NULL) AS missing,
                       max(received_at) AS latest
                FROM (%s) matches
                """.formatted(filtered(filter)), params(filter), (row, n) -> new Totals(
                row.getLong("rows"), row.getLong("sales"), row.getLong("collected"),
                row.getLong("missing"), row.getObject("latest", OffsetDateTime.class)));
    }

    @Override
    public List<Row> page(Filter filter, long offset, int limit, Cursor after) {
        var params = params(filter).addValue("limit", limit);
        String keyset = "";
        if (after != null) {
            keyset = " WHERE (sort_at < :afterAt OR (sort_at = :afterAt AND intent_id > :afterId))";
            params.addValue("afterAt", after.at()).addValue("afterId", after.intentId());
        } else {
            params.addValue("offset", offset);
        }
        return jdbc.query("SELECT * FROM (" + filtered(filter) + ") matches" + keyset + ORDER
                + " LIMIT :limit" + (after == null ? " OFFSET :offset" : ""), params, ROW);
    }

    @Override
    public void scan(Filter filter, Consumer<Row> consumer) {
        jdbc.query("SELECT * FROM (" + filtered(filter) + ") matches" + ORDER, params(filter),
                (org.springframework.jdbc.core.RowCallbackHandler) row -> consumer.accept(ROW.mapRow(row, 0)));
    }

    /** Stable total order: the period basis time, newest first, then the intent id. */
    private static final String ORDER = " ORDER BY sort_at DESC, intent_id, order_id";

    private String filtered(Filter filter) {
        String concert = (filter.concertId() == null ? "" : " AND o.concert_id = :concert")
                + (filter.eventId() == null ? "" : " AND o.concert_id IN (SELECT ec.id FROM concerts ec"
                + " LEFT JOIN performance_sales eps ON eps.id = ec.id WHERE ec.id = :event OR eps.event_id = :event)");
        String from = " >= :from AND ";
        if (filter.unattributed()) {
            String date = filter.byCollection() ? "p.verified_at" : "coalesce(i.effective_at, p.attempted_at)";
            return SELECT + ", " + date + " AS sort_at FROM ticketing_payment_intents i FULL JOIN payment_reconciliation p"
                    + " ON p.intent_id = i.intent_id AND p.order_id = i.order_id AND p.provider = i.provider"
                    + " AND p.requested_amount = i.amount" + JOINS
                    + " WHERE (i.intent_id IS NULL OR i.organization_id IS NULL) AND " + date + from + date + " < :to"
                    + concert;
        }
        String scope = filter.organizationId() == null ? "i.organization_id IS NOT NULL" : "i.organization_id = :organization";
        String attempt = filter.byCollection() ? "" : " AND i.effective_at >= :from AND i.effective_at < :to";
        String collected = filter.byCollection() ? " WHERE p.verified_at >= :from AND p.verified_at < :to" : "";
        String sort = filter.byCollection() ? "p.verified_at" : "i.effective_at";
        return SELECT + ", " + sort + " AS sort_at FROM (SELECT * FROM ticketing_payment_intents i WHERE " + scope
                + attempt + ") i LEFT JOIN payment_reconciliation p ON p.intent_id = i.intent_id"
                + " AND p.order_id = i.order_id AND p.provider = i.provider AND p.requested_amount = i.amount"
                + JOINS + collected + (collected.isEmpty() ? " WHERE true" : "") + concert;
    }

    private MapSqlParameterSource params(Filter filter) {
        return new MapSqlParameterSource("from", filter.from()).addValue("to", filter.to())
                .addValue("organization", filter.organizationId()).addValue("concert", filter.concertId()).addValue("event", filter.eventId());
    }

    private static Long amount(ResultSet row, String column) throws SQLException {
        var value = row.getBigDecimal(column);
        return value == null ? null : value.longValueExact();
    }
}
