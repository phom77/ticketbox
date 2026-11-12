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
    private static final String ROWS = """
            SELECT coalesce(p.intent_id, i.intent_id) AS intent_id,
                   coalesce(p.order_id, i.order_id) AS order_id, o.organization_id, o.concert_id,
                   c.title AS concert_title, coalesce(p.provider, i.provider) AS provider,
                   coalesce(p.state, 'PENDING_REPORT') AS payment_state,
                   o.status AS order_status, coalesce(p.requested_amount, i.amount) AS requested_amount,
                   CASE WHEN o.status = 'PAID' THEN o.total_amount ELSE 0 END AS sales_amount,
                   p.transaction_id, p.collected_amount, coalesce(p.attempted_at, i.created_at) AS attempted_at,
                   p.verified_at, p.refund_amount, p.refund_reference, p.changed_at, p.received_at
              FROM ticketing_payment_intents i
              FULL JOIN payment_reconciliation p ON p.intent_id = i.intent_id AND p.order_id = i.order_id
                   AND p.provider = i.provider AND p.requested_amount = i.amount
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
            r.getObject("received_at", OffsetDateTime.class));

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
    public List<Row> page(Filter filter, long offset, int limit) {
        return jdbc.query(sorted(filter) + " LIMIT :limit OFFSET :offset",
                params(filter).addValue("limit", limit).addValue("offset", offset), ROW);
    }

    @Override
    public void scan(Filter filter, Consumer<Row> consumer) {
        jdbc.query(sorted(filter), params(filter), (org.springframework.jdbc.core.RowCallbackHandler)
                row -> consumer.accept(ROW.mapRow(row, 0)));
    }

    private String sorted(Filter filter) {
        return "SELECT * FROM (" + filtered(filter) + ") matches ORDER BY "
                + (filter.byCollection() ? "verified_at" : "attempted_at") + " DESC, intent_id, order_id";
    }

    private String filtered(Filter filter) {
        String date = filter.byCollection() ? "p.verified_at" : "coalesce(p.attempted_at, i.created_at)";
        String scope = filter.unattributed() ? "o.organization_id IS NULL"
                : filter.organizationId() == null ? "o.organization_id IS NOT NULL" : "o.organization_id = :organization";
        return ROWS + " WHERE " + scope + " AND " + date + " >= :from AND " + date + " < :to"
                + (filter.concertId() == null ? "" : " AND o.concert_id = :concert");
    }

    private MapSqlParameterSource params(Filter filter) {
        return new MapSqlParameterSource("from", filter.from()).addValue("to", filter.to())
                .addValue("organization", filter.organizationId()).addValue("concert", filter.concertId());
    }

    private static Long amount(ResultSet row, String column) throws SQLException {
        var value = row.getBigDecimal(column);
        return value == null ? null : value.longValueExact();
    }
}
