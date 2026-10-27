package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.domain.PaymentAttempt;
import com.ticketbox.module.payment.domain.PaymentAttemptRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.EnumMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="embedded",matchIfMissing=true)
public class PaymentAttemptMetrics {
    private final PaymentAttemptRepository attempts;
    private final MeterRegistry metrics;
    private final EnumMap<PaymentAttempt.State,AtomicLong> counts = new EnumMap<>(PaymentAttempt.State.class);
    private final EnumMap<PaymentAttempt.State,AtomicLong> ages = new EnumMap<>(PaymentAttempt.State.class);
    public PaymentAttemptMetrics(PaymentAttemptRepository attempts, MeterRegistry metrics) {
        this.attempts=attempts; this.metrics=metrics;
        for (var state : PaymentAttempt.State.values()) {
            counts.put(state,new AtomicLong()); ages.put(state,new AtomicLong());
            metrics.gauge("ticketbox.payment.attempts",Tags.of("state",state.name()),counts.get(state));
            metrics.gauge("ticketbox.payment.oldest.seconds",Tags.of("state",state.name()),ages.get(state));
        }
    }
    @Scheduled(fixedDelay=30000)
    public void sample() {
        try {
            var rows=attempts.stateMetrics(); counts.values().forEach(v -> v.set(0)); ages.values().forEach(v -> v.set(0));
            for (var row : rows) {
                var state=PaymentAttempt.State.valueOf(row[0].toString());
                counts.get(state).set(((Number)row[1]).longValue()); ages.get(state).set(((Number)row[2]).longValue());
            }
        } catch (RuntimeException exception) { metrics.counter("ticketbox.payment.metrics.errors").increment(); }
    }
}
