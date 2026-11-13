package com.ticketbox.payments.infrastructure.worker;

import com.ticketbox.payments.infrastructure.http.TicketingPaymentResults;
import com.ticketbox.payments.application.dto.RefundResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;

import java.time.OffsetDateTime;
import java.util.UUID;

@Component
public class RefundResultPublisher {
    private final JdbcTemplate db;
    private final TicketingPaymentResults receiver;

    public RefundResultPublisher(JdbcTemplate db, TicketingPaymentResults receiver) {
        this.db = db;
        this.receiver = receiver;
    }

    public void publish() {
        var pending = db.query("""
                SELECT r.*, a.state AS attempt_state FROM refund_result_outbox o
                JOIN refund_reviews r ON r.request_id=o.case_id JOIN payment_attempts a ON a.intent_id=r.intent_id
                WHERE o.delivered_at IS NULL AND o.next_attempt_at<=clock_timestamp()
                    AND r.state IN ('ABORTED','RESOLVED_MANUALLY')
                ORDER BY o.next_attempt_at,o.case_id LIMIT 10
                """, (row, index) -> new RefundResult(1, row.getObject("request_id", UUID.class), row.getObject("order_id", UUID.class),
                "ABORTED".equals(row.getString("state")) ? "ABORTED" : "CONFIRMED", row.getLong("amount"),
                row.getString("provider"), row.getString("transaction_id"), row.getString("external_reference"),
                row.getObject("provider_refunded_at", OffsetDateTime.class),
                "RECONCILIATION_REQUIRED".equals(row.getString("attempt_state"))));
        for (RefundResult result : pending) {
            try {
                receiver.deliverRefund(result);
                db.update("UPDATE refund_result_outbox SET delivered_at=clock_timestamp() WHERE case_id=? AND delivered_at IS NULL", result.caseId());
            } catch (RestClientException unavailable) {
                db.update("UPDATE refund_result_outbox SET next_attempt_at=clock_timestamp()+interval '15 seconds'"
                        + " WHERE case_id=? AND delivered_at IS NULL", result.caseId());
            }
        }
    }
}
