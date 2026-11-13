package org.ticketbox.catalog.concert.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore;

import java.net.URI;
import java.util.UUID;

@Component
class TicketingDisruptionImpact implements EventDisruptionImpact {
    private final RestClient http;
    private final String ticketing;

    TicketingDisruptionImpact(RestClient http, @Value("${split.ticketing-url}") String ticketing) {
        this.http = http;
        this.ticketing = ticketing;
    }

    public Page impact(UUID concert, UUID operation, int page, int size) {
        String path = ticketing + "/internal/split/v1/event-disruptions/" + concert + "?page=" + page + "&size=" + size;
        if (operation != null) path += "&operation=" + operation;
        try {
            var result = http.get().uri(URI.create(path)).retrieve().body(Page.class);
            if (result != null) return result;
        } catch (RestClientException unavailable) {
            // The operator can retry the impact preview independently of Catalog.
        }
        throw new AppException(ErrorCode.DISRUPTION_SOURCE_UNAVAILABLE, "error.service-unavailable");
    }

    public void register(EventDisruptionStore.Operation operation) {
        http.post().uri(ticketing + "/internal/split/v1/event-disruptions").body(operation).retrieve().toBodilessEntity();
    }
}
