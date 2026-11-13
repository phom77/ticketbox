package org.ticketbox.ticketing.infrastructure.integration.notification;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.order.application.port.OrderDeliveryStatus;
import org.ticketbox.ticketing.order.application.port.OrderSupportQueue;

import java.util.List;
import java.util.UUID;

@Component
class RemoteOrderDeliveryStatus implements OrderDeliveryStatus {
    private final RestClient http;
    private final String url;

    RemoteOrderDeliveryStatus(RestClient http, @Value("${split.notification-url:http://notification:8080}") String url) {
        this.http = http;
        this.url = url;
    }

    public List<Email> emails(UUID orderId) {
        try {
            var emails = http.get().uri(url + "/internal/notifications/order-delivery/{id}", orderId)
                    .retrieve().body(new ParameterizedTypeReference<List<Email>>() {});
            if (emails != null) return emails;
        } catch (RestClientException unavailable) {
            throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
        throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
    }

    public OrderSupportQueue.Page failedEmails(int page, int size) {
        try {
            var results = http.get().uri(url + "/internal/notifications/support/failures?page={page}&size={size}", page, size)
                    .retrieve().body(OrderSupportQueue.Page.class);
            if (results != null) return results;
        } catch (RestClientException unavailable) {
            throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
        throw new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
    }
}
