package com.ticketbox.module.payment.infrastructure;

import com.ticketbox.module.payment.application.gateway.PaymentGateway;
import com.ticketbox.module.payment.application.gateway.PaymentInitiationResult;
import com.ticketbox.module.payment.application.gateway.PaymentWebhookResult;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.ticket.OrderView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Profile;

import java.util.Map;

@Component
@Profile("!prod")
public class MockPaymentGateway implements PaymentGateway {
    private final String baseUrl;

    public MockPaymentGateway(@Value("${ticketbox.payment.mock.base-url:http://localhost:8080}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    @Override
    public PaymentLog.Provider provider() {
        return PaymentLog.Provider.MOCK;
    }

    @Override
    public PaymentInitiationResult initiatePayment(OrderView order) {
        String providerRef = "MOCK-ORDER-" + order.id();
        String paymentUrl = baseUrl + "/api/mock-payments/" + order.id() + "/success";
        String rawPayload = "{\"provider\":\"MOCK\",\"orderId\":\"" + order.id() + "\"}";
        return new PaymentInitiationResult(provider(), paymentUrl, providerRef, rawPayload);
    }

    @Override
    public PaymentWebhookResult verifyWebhook(Map<String, String> params) {
        return PaymentWebhookResult.invalid("MOCK provider does not use external webhooks", params.toString());
    }
}
