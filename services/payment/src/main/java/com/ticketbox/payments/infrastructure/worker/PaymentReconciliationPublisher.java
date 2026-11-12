package com.ticketbox.payments.infrastructure.worker;

import com.ticketbox.payments.application.dto.ReconciliationSnapshot;
import com.ticketbox.payments.infrastructure.http.TicketingPaymentResults;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;

import java.time.OffsetDateTime;
import java.util.UUID;

@Component
public class PaymentReconciliationPublisher {
    private final JdbcTemplate jdbc;
    private final TicketingPaymentResults receiver;

    public PaymentReconciliationPublisher(JdbcTemplate jdbc, TicketingPaymentResults receiver) {
        this.jdbc = jdbc;
        this.receiver = receiver;
    }

    public void publish() {
        var pending = jdbc.query("""
                SELECT a.intent_id, a.order_id, o.revision, a.provider, a.state, a.amount,
                       a.provider_transaction_id, a.verified_at, a.created_at, o.changed_at,
                       r.amount AS refund_amount, r.external_reference
                FROM payment_reconciliation_outbox o
                JOIN payment_attempts a ON a.intent_id = o.intent_id
                LEFT JOIN refund_reviews r ON r.intent_id = a.intent_id
                     AND r.transaction_id = a.provider_transaction_id AND r.state = 'RESOLVED_MANUALLY'
                     AND r.external_reference IS NOT NULL
                WHERE o.revision > o.delivered_revision AND o.next_attempt_at <= clock_timestamp()
                ORDER BY o.next_attempt_at, o.intent_id LIMIT 25
                """, (row, index) -> {
            OffsetDateTime verified = row.getObject("verified_at", OffsetDateTime.class);
            long amount = row.getLong("amount");
            var refund = row.getBigDecimal("refund_amount");
            return new ReconciliationSnapshot(1, row.getObject("intent_id", UUID.class),
                    row.getObject("order_id", UUID.class), row.getLong("revision"),
                    row.getString("provider"), row.getString("state"), amount,
                    row.getString("provider_transaction_id"), verified == null ? null : amount,
                    row.getObject("created_at", OffsetDateTime.class), verified,
                    refund == null ? null : refund.longValueExact(), row.getString("external_reference"),
                    row.getObject("changed_at", OffsetDateTime.class));
        });
        for (ReconciliationSnapshot snapshot : pending) {
            try {
                receiver.deliverReconciliation(snapshot);
            } catch (RestClientException unavailable) {
                jdbc.update("""
                        UPDATE payment_reconciliation_outbox SET next_attempt_at = clock_timestamp() + interval '15 seconds'
                        WHERE intent_id=? AND revision=? AND delivered_revision < revision
                        """, snapshot.intentId(), snapshot.revision());
                continue;
            }
            jdbc.update("""
                    UPDATE payment_reconciliation_outbox SET delivered_revision = greatest(delivered_revision, ?)
                    WHERE intent_id=?
                    """, snapshot.revision(), snapshot.intentId());
        }
    }
}
