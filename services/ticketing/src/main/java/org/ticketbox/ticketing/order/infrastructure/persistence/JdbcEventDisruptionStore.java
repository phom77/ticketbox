package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.application.port.EventDisruptionStore;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
class JdbcEventDisruptionStore implements EventDisruptionStore {
    private static final RowMapper<Operation> OPERATION = (row, n) -> new Operation(
            row.getObject("id", UUID.class), row.getObject("concert_id", UUID.class), Kind.valueOf(row.getString("kind")),
            row.getString("reason"), row.getObject("actor_id", UUID.class), row.getObject("event_date", OffsetDateTime.class));
    private static final String IMPACT = """
            FROM orders o LEFT JOIN ticketing_payment_intents i ON i.order_id=o.id
            LEFT JOIN payment_reconciliation p ON p.intent_id=i.intent_id AND p.order_id=o.id
            WHERE o.concert_id=? AND o.created_at<=? AND
                (o.status IN ('AWAITING_PAYMENT','PAID','REFUNDED') OR p.collected_amount IS NOT NULL)
            """;
    private final JdbcTemplate db;

    JdbcEventDisruptionStore(JdbcTemplate db) { this.db = db; }

    public boolean accept(Operation operation) {
        db.update("""
                INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id,event_date)
                VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING
                """, operation.id(), operation.concertId(), operation.kind().name(), operation.reason(), operation.actorId(), operation.eventDate());
        var stored = db.queryForObject("SELECT * FROM event_disruptions WHERE id=?", OPERATION, operation.id());
        return stored != null && stored.concertId().equals(operation.concertId()) && stored.kind() == operation.kind()
                && stored.reason().equals(operation.reason()) && stored.actorId().equals(operation.actorId())
                && (stored.eventDate() == null ? operation.eventDate() == null
                : operation.eventDate() != null && stored.eventDate().toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS)
                .equals(operation.eventDate().toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
    }

    public Impact impact(UUID concert, UUID operation, int page, int size) {
        OffsetDateTime cutoff = operation == null ? OffsetDateTime.now()
                : db.query("SELECT cutoff_at FROM event_disruptions WHERE id=? AND concert_id=?",
                        (row, n) -> row.getObject(1, OffsetDateTime.class), operation, concert).stream().findFirst().orElse(null);
        if (cutoff == null) return new Impact(List.of(), page, size, 0, 0);
        long count = db.queryForObject("SELECT count(*) " + IMPACT, Long.class, concert, cutoff);
        var rows = db.query("""
                SELECT o.id,o.status,coalesce(p.state,i.state) AS payment_state,o.total_amount,
                    EXISTS (SELECT 1 FROM event_disruption_refunds r WHERE r.operation_id=? AND r.order_id=o.id AND r.resolved) AS case_prepared
                """ + IMPACT + " ORDER BY o.created_at DESC,o.id LIMIT ? OFFSET ?",
                (row, n) -> new Item(row.getObject("id", UUID.class), row.getString("status"), row.getString("payment_state"),
                        row.getLong("total_amount"), row.getBoolean("case_prepared")), operation, concert, cutoff, size, (long) page * size);
        return new Impact(rows, page, size, count, (int) ((count + size - 1) / size));
    }

    public List<Notice> notices() {
        return db.query("""
                WITH candidates AS (
                    SELECT DISTINCT d.id,o.user_id FROM event_disruptions d JOIN orders o ON o.concert_id=d.concert_id
                    LEFT JOIN ticketing_payment_intents i ON i.order_id=o.id
                    WHERE o.created_at<=d.cutoff_at AND (o.status IN ('PAID','REFUNDED') OR i.intent_id IS NOT NULL)
                      AND NOT EXISTS (SELECT 1 FROM event_disruption_notices n WHERE n.operation_id=d.id AND n.user_id=o.user_id)
                    ORDER BY d.id,o.user_id LIMIT 100
                ), inserted AS (
                    INSERT INTO event_disruption_notices(operation_id,user_id) SELECT id,user_id FROM candidates
                    ON CONFLICT DO NOTHING RETURNING operation_id,user_id
                ) SELECT d.*,i.user_id,c.title FROM inserted i JOIN event_disruptions d ON d.id=i.operation_id
                    JOIN concerts c ON c.id=d.concert_id
                """, (row, n) -> new Notice(OPERATION.mapRow(row, n), row.getObject("user_id", UUID.class), row.getString("title")));
    }

    public void enqueueRefunds() {
        db.update("""
                INSERT INTO event_disruption_refunds(operation_id,order_id)
                SELECT d.id,o.id FROM event_disruptions d JOIN orders o ON o.concert_id=d.concert_id
                WHERE d.kind='CANCEL' AND o.created_at<=d.cutoff_at AND o.status='PAID'
                ON CONFLICT DO NOTHING
                """);
    }

    public List<PendingRefund> pendingRefunds() {
        return db.query("""
                SELECT d.*,r.order_id FROM event_disruption_refunds r JOIN event_disruptions d ON d.id=r.operation_id
                WHERE NOT r.resolved AND r.next_attempt_at<=clock_timestamp()
                ORDER BY r.next_attempt_at,r.operation_id,r.order_id LIMIT 10
                """, (row, n) -> new PendingRefund(OPERATION.mapRow(row, n), row.getObject("order_id", UUID.class)));
    }

    public void finish(PendingRefund work, boolean prepared) {
        db.update("UPDATE event_disruption_refunds SET resolved=?,next_attempt_at=clock_timestamp()+interval '20 seconds'"
                + " WHERE operation_id=? AND order_id=? AND NOT resolved", prepared, work.operation().id(), work.orderId());
    }
}
