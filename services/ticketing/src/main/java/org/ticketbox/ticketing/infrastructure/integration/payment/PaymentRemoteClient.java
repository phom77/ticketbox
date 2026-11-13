package org.ticketbox.ticketing.infrastructure.integration.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.ticketbox.ticketing.application.port.payment.PaymentIntent;
import org.ticketbox.ticketing.application.port.payment.PaymentSnapshot;

import java.util.*;

@Component
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
public class PaymentRemoteClient
        implements org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient {
    private final RestClient http;

    public PaymentRemoteClient(
            @Value("${ticketbox.payments.url}") String url,
            @Value("${ticketbox.payments.service-token}") String token) {
        if (token.length() < 32)
            throw new IllegalStateException("Payment service token must be at least 32 characters");
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(15000);
        http =
                RestClient.builder()
                        .baseUrl(url)
                        .requestFactory(factory)
                        .defaultHeader("X-Service-Token", token)
                        .build();
    }

    @Override
    public List<String> availableProviders() {
        String[] providers = http.get().uri("/internal/providers").retrieve().body(String[].class);
        return providers == null ? List.of() : List.of(providers);
    }

    public PaymentSnapshot submit(PaymentIntent intent) {
        var snapshot =
                http.post()
                        .uri("/internal/intents")
                        .body(intent)
                        .retrieve()
                        .body(PaymentSnapshot.class);
        return new PaymentSnapshot(
                snapshot.attemptId(),
                "SETTLEMENT_PENDING".equals(snapshot.state()) ? "UNKNOWN" : snapshot.state(),
                snapshot.paymentUrl(),
                snapshot.providerRef());
    }

    public void mock(UUID order, boolean success) {
        http.post()
                .uri("/internal/mock/{id}/{success}", order, success)
                .retrieve()
                .toBodilessEntity();
    }

    public Map webhook(String provider, Map<String, String> body) {
        return http.post()
                .uri("/internal/webhooks/{provider}", provider)
                .body(body)
                .retrieve()
                .body(Map.class);
    }

    public Object reviews() {
        return http.get().uri("/internal/reviews").retrieve().body(Object.class);
    }

    @Override
    public PaymentSupport support(UUID order) {
        try {
            return http.get().uri("/internal/reviews/{order}", order).retrieve().body(PaymentSupport.class);
        } catch (org.springframework.web.client.RestClientException unavailable) {
            throw new org.ticketbox.ticketing.application.error.AppException(
                    org.ticketbox.ticketing.application.error.ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
    }

    @Override
    public org.ticketbox.ticketing.order.application.port.OrderSupportQueue.Page pendingRefunds(int page, int size) {
        try {
            return http.get().uri("/internal/reviews/pending-refunds?page={page}&size={size}", page, size)
                    .retrieve().body(org.ticketbox.ticketing.order.application.port.OrderSupportQueue.Page.class);
        } catch (org.springframework.web.client.RestClientException unavailable) {
            throw new org.ticketbox.ticketing.application.error.AppException(
                    org.ticketbox.ticketing.application.error.ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
    }

    public Object review(UUID order, Map<String, Object> body) {
        return http.post()
                .uri("/internal/reviews/{id}", order)
                .body(body)
                .retrieve()
                .body(Object.class);
    }
}
