package com.ticketbox.payments.infrastructure.worker;

import io.micrometer.core.instrument.MeterRegistry;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
public class PaymentMetrics {
    private final JdbcTemplate db;
    private final AtomicLong pending = new AtomicLong();
    private final AtomicLong reviews = new AtomicLong();

    public PaymentMetrics(JdbcTemplate db, MeterRegistry metrics) {
        this.db = db;
        metrics.gauge("ticketbox.payment.results.pending", pending);
        metrics.gauge("ticketbox.payment.reviews.open", reviews);
    }

    @Scheduled(fixedDelay = 10000)
    public void metrics() {
        pending.set(
                db.queryForObject(
                        "SELECT count(*) FROM payment_result_outbox WHERE completed_at IS NULL",
                        Long.class));
        reviews.set(
                db.queryForObject(
                        "SELECT (SELECT count(*) FROM refund_reviews WHERE"
                                + " state='REVIEW_REQUIRED')+(SELECT count(*) FROM payment_attempts"
                                + " WHERE state='REVIEW_REQUIRED')",
                        Long.class));
    }
}
