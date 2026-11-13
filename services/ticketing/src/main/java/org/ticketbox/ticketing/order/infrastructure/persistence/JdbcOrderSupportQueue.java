package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.order.application.port.OrderSupportQueue;

import java.time.OffsetDateTime;
import java.util.UUID;

@Repository
class JdbcOrderSupportQueue implements OrderSupportQueue {
    private final JdbcTemplate db;

    JdbcOrderSupportQueue(JdbcTemplate db) {
        this.db = db;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page list(Kind kind, int page, int size) {
        String condition = switch (kind) {
            case UNKNOWN_PAYMENT -> "p.state IN ('UNKNOWN','REVIEW_REQUIRED') AND p.collected_amount IS NULL";
            case PENDING_REFUND -> throw new IllegalArgumentException("Refund decisions are owned by Payment");
            case MISSING_TICKETS -> """
                    p.collected_amount IS NOT NULL AND o.status='PAID' AND EXISTS (
                        SELECT 1 FROM order_items line LEFT JOIN tickets t ON t.order_item_id=line.id
                        WHERE line.order_id=o.id GROUP BY line.id,line.quantity HAVING count(t.id)<line.quantity
                    )
                    """;
            case FAILED_EMAIL -> throw new IllegalArgumentException("Email failures are owned by Notification");
        };
        String source = """
                FROM payment_reconciliation p JOIN ticketing_payment_intents i ON i.intent_id=p.intent_id
                    AND p.order_id=i.order_id AND p.provider=i.provider AND p.requested_amount=i.amount
                JOIN orders o ON o.id=i.order_id WHERE
                """ + condition;
        long count = db.queryForObject("SELECT count(*) " + source, Long.class);
        var rows = db.query("SELECT o.id,p.intent_id,p.state,p.changed_at " + source
                        + " ORDER BY p.changed_at DESC,p.intent_id LIMIT ? OFFSET ?",
                (row, n) -> new Item(row.getObject("id", UUID.class), row.getObject("intent_id", UUID.class),
                        row.getString("state"), row.getObject("changed_at", OffsetDateTime.class),
                        kind == Kind.UNKNOWN_PAYMENT && "REVIEW_REQUIRED".equals(row.getString("state"))),
                size, (long) page * size);
        return new Page(rows, page, size, count, (int) ((count + size - 1) / size));
    }
}
