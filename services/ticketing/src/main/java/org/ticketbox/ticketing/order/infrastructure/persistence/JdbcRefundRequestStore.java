package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.application.port.RefundRequestStore;
import org.ticketbox.ticketing.order.domain.RefundEligibility;
import org.ticketbox.ticketing.order.domain.RefundRequest;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcRefundRequestStore implements RefundRequestStore {
    private static final String COLUMNS = """
            r.id, r.order_id, r.buyer_id, r.reason, r.origin, r.status, r.decided_by, r.decision_note,
            r.created_at, r.decided_at, r.payment_case_id
            """;
    private static final String ROW_SELECT = "SELECT " + COLUMNS + """
            , o.reference_code, o.concert_id, o.organization_id, o.total_amount,
            COALESCE(o.performance_title, c.title) AS title
            FROM refund_requests r JOIN orders o ON o.id = r.order_id JOIN concerts c ON c.id = o.concert_id
            """;

    private final JdbcTemplate jdbc;

    JdbcRefundRequestStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<OrderRef> order(UUID orderId) {
        return orderRef("SELECT id, user_id, organization_id, concert_id FROM orders WHERE id = ?", orderId);
    }

    @Override
    public Optional<OrderRef> lockOrder(UUID orderId) {
        return orderRef("SELECT id, user_id, organization_id, concert_id FROM orders WHERE id = ? FOR UPDATE", orderId);
    }

    private Optional<OrderRef> orderRef(String sql, UUID orderId) {
        return jdbc.query(sql, (rs, n) -> new OrderRef(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getObject("organization_id", UUID.class), rs.getObject("concert_id", UUID.class)), orderId)
                .stream().findFirst();
    }

    @Override
    public Optional<UUID> orderIdOf(UUID requestId) {
        return jdbc.query("SELECT order_id FROM refund_requests WHERE id = ?", (rs, n) -> rs.getObject(1, UUID.class),
                requestId).stream().findFirst();
    }

    @Override
    public RefundEligibility.Facts facts(UUID orderId) {
        return jdbc.queryForObject("""
                SELECT o.status = 'PAID' AS paid,
                    (SELECT count(*) FROM tickets t JOIN order_items i ON i.id = t.order_item_id
                        WHERE i.order_id = o.id AND t.status = 'VALID') AS valid,
                    (SELECT count(*) FROM tickets t JOIN order_items i ON i.id = t.order_item_id
                        WHERE i.order_id = o.id AND t.status = 'USED') AS used,
                    (SELECT count(*) FROM tickets t JOIN order_items i ON i.id = t.order_item_id
                        WHERE i.order_id = o.id AND (t.status = 'TRANSFERRED' OR t.transferred_from_ticket_id IS NOT NULL)) AS moved,
                    EXISTS (SELECT 1 FROM ticket_transfers x JOIN tickets t ON t.id = x.ticket_id
                        JOIN order_items i ON i.id = t.order_item_id
                        WHERE i.order_id = o.id AND x.status = 'PENDING') AS pending_transfer,
                    EXISTS (SELECT 1 FROM order_refunds f WHERE f.order_id = o.id) AS refund_case,
                    EXISTS (SELECT 1 FROM refund_requests q WHERE q.order_id = o.id
                        AND q.status IN ('REQUESTED', 'APPROVED')) AS open_request,
                    COALESCE(c.doors_open_at, o.performance_starts_at, c.event_date) AS doors,
                    COALESCE(d.event_date, c.event_date) AS event_date,
                    d.kind AS disruption
                FROM orders o JOIN concerts c ON c.id = o.concert_id
                LEFT JOIN LATERAL (SELECT kind, event_date FROM event_disruptions e WHERE e.concert_id = o.concert_id
                    ORDER BY e.cutoff_at DESC, e.id LIMIT 1) d ON true
                WHERE o.id = ?
                """, (rs, n) -> new RefundEligibility.Facts(rs.getBoolean("paid"), rs.getInt("valid"), rs.getInt("used"),
                rs.getInt("moved"), rs.getBoolean("pending_transfer"), rs.getBoolean("refund_case"),
                rs.getBoolean("open_request"), rs.getObject("doors", OffsetDateTime.class),
                rs.getObject("event_date", OffsetDateTime.class), disruption(rs.getString("disruption"))), orderId);
    }

    private static RefundEligibility.Disruption disruption(String kind) {
        if (kind == null) return RefundEligibility.Disruption.NONE;
        return "CANCEL".equals(kind) ? RefundEligibility.Disruption.CANCELLED : RefundEligibility.Disruption.POSTPONED;
    }

    @Override
    public Optional<RefundRequest> find(UUID requestId) {
        return one("WHERE r.id = ?", requestId);
    }

    @Override
    public Optional<RefundRequest> findLatestByOrder(UUID orderId) {
        return one("WHERE r.order_id = ? ORDER BY r.created_at DESC LIMIT 1", orderId);
    }

    @Override
    public Optional<RefundRequest> findOpenByOrder(UUID orderId) {
        return one("WHERE r.order_id = ? AND r.status IN ('REQUESTED', 'APPROVED')", orderId);
    }

    @Override
    public Optional<RefundRequest> findByCase(UUID caseId) {
        return one("WHERE r.payment_case_id = ?", caseId);
    }

    private Optional<RefundRequest> one(String where, Object argument) {
        return jdbc.query("SELECT " + COLUMNS + " FROM refund_requests r " + where, REQUESTS, argument).stream().findFirst();
    }

    @Override
    public Optional<Row> row(UUID requestId) {
        return jdbc.query(ROW_SELECT + " WHERE r.id = ?", ROWS, requestId).stream().findFirst();
    }

    @Override
    public void insert(RefundRequest r) {
        jdbc.update("""
                INSERT INTO refund_requests(id, order_id, buyer_id, reason, origin, status, decided_by, decision_note,
                    created_at, decided_at, payment_case_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, r.id(), r.orderId(), r.buyerId(), r.reason(), r.origin().name(), r.status().name(), r.decidedBy(),
                r.decisionNote(), r.createdAt(), r.decidedAt(), r.paymentCaseId());
    }

    @Override
    public void update(RefundRequest r) {
        jdbc.update("""
                UPDATE refund_requests SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?,
                    payment_case_id = ? WHERE id = ?
                """, r.status().name(), r.decidedBy(), r.decisionNote(), r.decidedAt(), r.paymentCaseId(), r.id());
    }

    @Override
    public Page list(UUID organizationId, List<RefundRequest.Status> statuses, OffsetDateTime createdBefore, int page,
            int size) {
        var where = new StringBuilder(" WHERE 1 = 1");
        var args = new ArrayList<Object>();
        if (organizationId != null) {
            where.append(" AND o.organization_id = ?");
            args.add(organizationId);
        }
        if (!statuses.isEmpty()) {
            where.append(" AND r.status IN (").append(String.join(",", statuses.stream().map(s -> "?").toList())).append(")");
            statuses.forEach(s -> args.add(s.name()));
        }
        if (createdBefore != null) {
            where.append(" AND r.created_at <= ?");
            args.add(createdBefore);
        }
        Long total = jdbc.queryForObject("SELECT count(*) FROM refund_requests r JOIN orders o ON o.id = r.order_id"
                + where, Long.class, args.toArray());
        var pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);
        var rows = jdbc.query(ROW_SELECT + where + " ORDER BY (r.status IN ('REQUESTED', 'APPROVED')) DESC,"
                + " r.created_at ASC, r.id LIMIT ? OFFSET ?", ROWS, pageArgs.toArray());
        long count = total == null ? 0 : total;
        return new Page(rows, page, size, count, (int) ((count + size - 1) / size));
    }

    @Override
    public List<UUID> approvedWithoutCase(OffsetDateTime approvedBefore, int limit) {
        return jdbc.query("""
                SELECT id FROM refund_requests WHERE status = 'APPROVED' AND payment_case_id IS NULL AND decided_at <= ?
                ORDER BY decided_at, id LIMIT ?
                """, (rs, n) -> rs.getObject(1, UUID.class), approvedBefore, limit);
    }

    private static final RowMapper<RefundRequest> REQUESTS = (rs, n) -> request(rs);

    private static final RowMapper<Row> ROWS = (rs, n) -> new Row(request(rs), rs.getString("reference_code"),
            rs.getObject("concert_id", UUID.class), rs.getString("title"), rs.getBigDecimal("total_amount"),
            rs.getObject("organization_id", UUID.class));

    private static RefundRequest request(ResultSet rs) throws SQLException {
        return new RefundRequest(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getObject("buyer_id", UUID.class), rs.getString("reason"),
                RefundRequest.Origin.valueOf(rs.getString("origin")), RefundRequest.Status.valueOf(rs.getString("status")),
                rs.getObject("decided_by", UUID.class), rs.getString("decision_note"),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("decided_at", OffsetDateTime.class),
                rs.getObject("payment_case_id", UUID.class));
    }
}
