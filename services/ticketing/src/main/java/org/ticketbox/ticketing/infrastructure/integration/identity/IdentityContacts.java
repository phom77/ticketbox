package org.ticketbox.ticketing.infrastructure.integration.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.application.port.identity.UserContactView;

import java.util.Optional;
import java.util.UUID;

@Component
public class IdentityContacts implements UserContactPort {
    private final RestClient http;
    private final String identity;

    public IdentityContacts(RestClient http, @Value("${split.identity-url}") String identity) {
        this.http = http;
        this.identity = identity;
    }

    public Optional<UserContactView> findById(UUID id) {
        try {
            return Optional.ofNullable(
                    http.get()
                            .uri(identity + "/internal/split/users/" + id)
                            .retrieve()
                            .body(UserContactView.class));
        } catch (HttpClientErrorException.NotFound absent) {
            return Optional.empty();
        }
    }

    @Override
    public Optional<UUID> findAccountIdByEmail(String email) {
        try {
            var result = http.post().uri(identity + "/internal/split/users/lookup")
                    .body(java.util.Map.of("email", email)).retrieve().body(AccountId.class);
            return Optional.ofNullable(result).map(AccountId::id);
        } catch (HttpClientErrorException.NotFound absent) {
            return Optional.empty();
        } catch (org.springframework.web.client.RestClientException unavailable) {
            throw new org.ticketbox.ticketing.application.error.AppException(
                    org.ticketbox.ticketing.application.error.ErrorCode.SUPPORT_SOURCE_UNAVAILABLE);
        }
    }

    private record AccountId(UUID id) {}
}
