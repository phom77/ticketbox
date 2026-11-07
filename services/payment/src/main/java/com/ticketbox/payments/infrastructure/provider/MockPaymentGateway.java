package com.ticketbox.payments.infrastructure.provider;

import com.ticketbox.payments.application.port.PaymentGateway;
import com.ticketbox.payments.domain.OrderView;
import com.ticketbox.payments.domain.PaymentInitiationResult;
import com.ticketbox.payments.domain.PaymentWebhookResult;
import com.ticketbox.payments.domain.Provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Profile("!prod")
public class MockPaymentGateway implements PaymentGateway {
    private final String baseUrl;

    public MockPaymentGateway(
            @Value("${ticketbox.payment.mock.base-url:http://localhost:8080}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    @Override
    public Provider provider() {
        return Provider.MOCK;
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
        return PaymentWebhookResult.invalid(
                "MOCK provider does not use external webhooks", params.toString());
    }
}
