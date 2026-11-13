package org.ticketbox.catalog.concert.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.ticketbox.catalog.concert.application.port.OrganizerDisplayNames;

import java.util.Optional;
import java.util.UUID;

@Component
class IdentityDisplayNames implements OrganizerDisplayNames {
    private final RestClient http;
    private final String identity;

    IdentityDisplayNames(RestClient http, @Value("${split.identity-url}") String identity) {
        this.http = http;
        this.identity = identity;
    }

    public Optional<String> find(UUID organization) {
        try {
            return Optional.ofNullable(http.get().uri(identity + "/internal/split/v1/organizations/{id}/name", organization)
                    .retrieve().body(DisplayName.class)).map(DisplayName::name);
        } catch (RestClientException unavailable) {
            return Optional.empty();
        }
    }

    private record DisplayName(String name) {}
}
