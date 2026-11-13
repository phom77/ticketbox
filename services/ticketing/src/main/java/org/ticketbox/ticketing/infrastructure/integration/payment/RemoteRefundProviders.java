package org.ticketbox.ticketing.infrastructure.integration.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;

import java.util.List;
import java.util.UUID;

@Component
class RemoteRefundProviders implements RefundProviders {
    private final RestClient payment;
    private final RestClient service;
    private final String checkin;

    RemoteRefundProviders(RestClient service, @Value("${split.checkin-url:http://checkin:8080}") String checkin,
            @Value("${ticketbox.payments.url:http://payment:8080}") String paymentUrl,
            @Value("${ticketbox.payments.service-token}") String paymentToken) {
        this.service = service;
        this.checkin = checkin;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        this.payment = RestClient.builder().requestFactory(factory).baseUrl(paymentUrl)
                .defaultHeader("X-Service-Token", paymentToken).build();
    }

    public Case apply(UUID order, Command command) {
        try {
            return payment.post().uri("/internal/refunds/{order}", order).body(command).retrieve().body(Case.class);
        } catch (ResourceAccessException failure) {
            throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
    }

    public Admission hold(UUID caseId, List<UUID> tickets) {
        try {
            return service.post().uri(checkin + "/internal/split/refund-admission/{id}/hold", caseId)
                    .body(tickets).retrieve().body(Admission.class);
        } catch (ResourceAccessException failure) {
            throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
    }

    public void release(UUID caseId) {
        service.post().uri(checkin + "/internal/split/refund-admission/{id}/release", caseId).retrieve().toBodilessEntity();
    }
}
