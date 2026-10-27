package com.ticketbox.module.payment.application.gateway;

import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.ticket.OrderView;

import java.util.Map;

public interface PaymentGateway {
    PaymentLog.Provider provider();

    PaymentInitiationResult initiatePayment(OrderView order);

    default PaymentInitiationResult initiatePayment(OrderView order, String requestId) {
        return initiatePayment(order);
    }

    default PaymentQueryResult queryPayment(OrderView order, String requestId, String initiationPayload) {
        return PaymentQueryResult.unknown();
    }

    PaymentWebhookResult verifyWebhook(Map<String, String> params);
}
