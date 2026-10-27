package com.ticketbox.module.payment.application;

import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.concurrent.Semaphore;
import java.util.function.Supplier;

/** Fail-fast bulkheads prevent unbounded gateway work; no queued requests occupy DB connections. */
@Component
public class PaymentGatewayExecutor {
    private final Semaphore creates;
    private final Semaphore queries;
    private final MeterRegistry metrics;
    @org.springframework.beans.factory.annotation.Autowired
    public PaymentGatewayExecutor(@Value("${ticketbox.payment.max-concurrent-creates:8}") int creates,
                                  @Value("${ticketbox.payment.max-concurrent-queries:2}") int queries,
                                  MeterRegistry metrics) {
        if (creates < 1 || queries < 1) throw new IllegalArgumentException("Payment concurrency must be positive");
        this.creates = new Semaphore(creates); this.queries = new Semaphore(queries); this.metrics = metrics;
        metrics.gauge("ticketbox.payment.gateway.active", java.util.List.of(io.micrometer.core.instrument.Tag.of("operation","create")),
                this.creates, s -> creates - s.availablePermits());
        metrics.gauge("ticketbox.payment.gateway.active", java.util.List.of(io.micrometer.core.instrument.Tag.of("operation","query")),
                this.queries, s -> queries - s.availablePermits());
    }
    public PaymentGatewayExecutor(int creates, int queries) {
        this(creates,queries,new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
    }
    public <T> T create(Supplier<T> action) { return execute(creates, "create", action); }
    public <T> T query(Supplier<T> action) { return execute(queries, "query", action); }
    private <T> T execute(Semaphore slots, String operation, Supplier<T> action) {
        if (!slots.tryAcquire()) {
            metrics.counter("ticketbox.payment.gateway.rejected","operation",operation).increment();
            throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,"Cổng thanh toán đang bận. Vui lòng thử lại sau");
        }
        long started = System.nanoTime();
        try { return action.get(); }
        finally {
            slots.release(); metrics.timer("ticketbox.payment.gateway.duration","operation",operation)
                    .record(System.nanoTime()-started, java.util.concurrent.TimeUnit.NANOSECONDS);
        }
    }
}
