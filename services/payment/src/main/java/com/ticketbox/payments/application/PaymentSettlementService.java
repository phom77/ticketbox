package com.ticketbox.payments.application;

import com.ticketbox.payments.application.port.PaymentGateways;
import com.ticketbox.payments.application.port.PaymentRepository;
import com.ticketbox.payments.application.port.PaymentResults;
import com.ticketbox.payments.domain.PaymentQueryResult;
import com.ticketbox.payments.domain.Provider;

import org.springframework.stereotype.Service;

@Service
public class PaymentSettlementService {
    private final PaymentRepository store;
    private final PaymentGateways gateways;
    private final PaymentResults results;

    public PaymentSettlementService(
            PaymentRepository store, PaymentGateways gateways, PaymentResults results) {
        this.store = store;
        this.gateways = gateways;
        this.results = results;
    }

    public void results() {
        for (var delivery : store.claimResults(4)) {
            try {
                store.acknowledged(delivery, results.deliver(delivery.payload()));
            } catch (Exception error) {
                store.deliveryFailed(delivery, error.getClass().getSimpleName());
            }
        }
    }

    public void queries() {
        for (var attempt : store.claimQueries(2)) {
            PaymentQueryResult result = PaymentQueryResult.unknown();
            try {
                result =
                        gateways.resolve(Provider.valueOf(attempt.intent().provider()))
                                .queryPayment(
                                        attempt.order(),
                                        attempt.intent().requestId(),
                                        attempt.raw());
            } catch (RuntimeException ignored) {
                // Keep the original request identity when provider status is uncertain.
            }
            try {
                store.queryResult(attempt, result);
            } catch (org.springframework.dao.DataIntegrityViolationException conflict) {
                store.transactionConflict(attempt.intent().orderId());
            }
        }
    }
}
