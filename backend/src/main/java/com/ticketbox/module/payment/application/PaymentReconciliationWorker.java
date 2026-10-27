package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.application.gateway.*;
import com.ticketbox.module.ticket.OrderPort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor @Slf4j
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="embedded",matchIfMissing=true)
public class PaymentReconciliationWorker {
    private final PaymentAttemptTransactions transactions;
    private final PaymentGatewayResolver gateways;
    private final PaymentGatewayExecutor executor;
    private final OrderPort orders;
    private final java.util.concurrent.ExecutorService queryThread = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean running = new java.util.concurrent.atomic.AtomicBoolean();
    @jakarta.annotation.PreDestroy
    void close() { queryThread.shutdownNow(); }
    @Scheduled(fixedDelayString = "${ticketbox.payment.reconciliation-interval-ms:10000}")
    public void schedule() {
        if (!running.compareAndSet(false, true)) return;
        queryThread.execute(() -> {
            try { reconcile(); }
            catch (RuntimeException exception) { log.warn("Payment reconciliation unavailable", exception); }
            finally { running.set(false); }
        });
    }
    public void reconcile() {
        for (var claim : transactions.claimQueries(2)) {
            PaymentQueryResult result = PaymentQueryResult.unknown();
            try {
                var order = orders.findOrderById(claim.orderId()).orElseThrow();
                result = executor.query(() -> gateways.resolve(claim.provider())
                        .queryPayment(order, claim.requestId(), claim.payload()));
            } catch (RuntimeException exception) {
                log.warn("Payment query unavailable for order {}: {}", claim.orderId(), exception.getClass().getSimpleName());
            }
            try { transactions.finishQuery(claim, result); }
            catch (RuntimeException exception) { log.warn("Payment query finalization failed for {}", claim.orderId(), exception); }
        }
    }
}
