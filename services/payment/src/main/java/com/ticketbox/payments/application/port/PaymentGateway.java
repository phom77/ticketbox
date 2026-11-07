package com.ticketbox.payments.application.port;

import com.ticketbox.payments.domain.OrderView;
import com.ticketbox.payments.domain.PaymentInitiationResult;
import com.ticketbox.payments.domain.PaymentQueryResult;
import com.ticketbox.payments.domain.PaymentWebhookResult;
import com.ticketbox.payments.domain.Provider;

import java.util.Map;

public interface PaymentGateway {
    Provider provider();

    PaymentInitiationResult initiatePayment(OrderView order);

    default PaymentInitiationResult initiatePayment(OrderView order, String requestId) {
        return initiatePayment(order);
    }

    default PaymentQueryResult queryPayment(
            OrderView order, String requestId, String initiationPayload) {
        return PaymentQueryResult.unknown();
    }

    PaymentWebhookResult verifyWebhook(Map<String, String> params);
}
