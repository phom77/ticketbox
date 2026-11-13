package com.ticketbox.payments.infrastructure.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.payments.application.dto.PaymentContract.Ack;
import com.ticketbox.payments.application.dto.PaymentContract.Result;
import com.ticketbox.payments.application.port.PaymentResults;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TicketingPaymentResults implements PaymentResults {
    private final RestClient ticketing;
    private final ObjectMapper json;

    public TicketingPaymentResults(
            ObjectMapper json,
            @Value("${payment.core-url}") String url,
            @Value("${payment.service-token}") String token) {
        this.json = json;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        ticketing =
                RestClient.builder()
                        .baseUrl(url)
                        .defaultHeader("X-Service-Token", token)
                        .requestFactory(factory)
                        .build();
    }

    public void deliverReconciliation(com.ticketbox.payments.application.dto.ReconciliationSnapshot snapshot) {
        ticketing.post().uri("/internal/ticketing/payment-reconciliation")
                .body(snapshot).retrieve().toBodilessEntity();
    }

    public void deliverRefund(com.ticketbox.payments.application.dto.RefundResult result) {
        ticketing.post().uri("/internal/ticketing/refund-results").body(result).retrieve().toBodilessEntity();
    }

    public Ack deliver(String payload) throws Exception {
        var result = json.readValue(payload, Result.class);
        return ticketing
                .post()
                .uri("/internal/ticketing/payment-results")
                .body(result)
                .retrieve()
                .body(Ack.class);
    }
}
