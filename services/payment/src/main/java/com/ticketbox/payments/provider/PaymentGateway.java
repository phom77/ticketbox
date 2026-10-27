package com.ticketbox.payments.provider;

import com.ticketbox.payments.provider.Provider;
import com.ticketbox.payments.provider.OrderView;

import java.util.Map;

public interface PaymentGateway {
    Provider provider();

    PaymentInitiationResult initiatePayment(OrderView order);

    default PaymentInitiationResult initiatePayment(OrderView order, String requestId) {
        return initiatePayment(order);
    }

    default PaymentQueryResult queryPayment(OrderView order, String requestId, String initiationPayload) {
        return PaymentQueryResult.unknown();
    }

    PaymentWebhookResult verifyWebhook(Map<String, String> params);
}
