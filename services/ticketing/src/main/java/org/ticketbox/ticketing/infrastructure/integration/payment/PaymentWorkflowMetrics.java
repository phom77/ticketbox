package org.ticketbox.ticketing.infrastructure.integration.payment;

import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.queue.application.port.DispatchBacklog;

import java.util.concurrent.atomic.AtomicLong;

@Component
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
public class PaymentWorkflowMetrics implements DispatchBacklog {
    private final JdbcTemplate db;
    private final AtomicLong pending = new AtomicLong(), oldest = new AtomicLong();

    public PaymentWorkflowMetrics(JdbcTemplate db, MeterRegistry metrics) {
        this.db = db;
        metrics.gauge("ticketbox.payment.intents.pending", pending);
        metrics.gauge("ticketbox.payment.intents.oldest.seconds", oldest);
    }

    @Override
    public boolean overdue() {
        return Boolean.TRUE.equals(db.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM ticketing_payment_intents
                    WHERE state IN ('CREATED', 'UNKNOWN') AND attempt_id IS NULL AND payment_url IS NULL
                      AND next_attempt_at <= now() AND expires_at > now()
                      AND created_at < now() - interval '15 seconds'
                )
                """, Boolean.class));
    }

    @Scheduled(fixedDelay = 10000)
    public void sample() {
        var row =
                db.queryForMap(
                        "SELECT count(*) AS pending,coalesce(extract(epoch FROM"
                                + " now()-min(created_at)),0) AS age FROM ticketing_payment_intents"
                                + " WHERE state NOT IN ('SETTLED','REJECTED','FAILED')");
        pending.set(((Number) row.get("pending")).longValue());
        oldest.set(((Number) row.get("age")).longValue());
    }
}
