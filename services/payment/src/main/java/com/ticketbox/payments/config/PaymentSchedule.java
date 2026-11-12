package com.ticketbox.payments.config;

import com.ticketbox.payments.application.PaymentSettlementService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PaymentSchedule {
    private final PaymentSettlementService settlements;

    private final com.ticketbox.payments.infrastructure.worker.PaymentReconciliationPublisher reconciliation;

    public PaymentSchedule(PaymentSettlementService settlements,
            com.ticketbox.payments.infrastructure.worker.PaymentReconciliationPublisher reconciliation) {
        this.settlements = settlements;
        this.reconciliation = reconciliation;
    }

    @Scheduled(fixedDelayString = "${payment.worker-interval-ms:1000}")
    public void results() {
        settlements.results();
    }

    @Scheduled(fixedDelayString = "${payment.reconciliation-interval-ms:2000}")
    public void reconciliation() {
        reconciliation.publish();
    }

    @Scheduled(fixedDelayString = "${payment.query-interval-ms:10000}")
    public void queries() {
        settlements.queries();
    }
}
