package com.ticketbox.payments.config;

import com.ticketbox.payments.application.PaymentSettlementService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PaymentSchedule {
    private final PaymentSettlementService settlements;

    public PaymentSchedule(PaymentSettlementService settlements) {
        this.settlements = settlements;
    }

    @Scheduled(fixedDelayString = "${payment.worker-interval-ms:1000}")
    public void results() {
        settlements.results();
    }

    @Scheduled(fixedDelayString = "${payment.query-interval-ms:10000}")
    public void queries() {
        settlements.queries();
    }
}
