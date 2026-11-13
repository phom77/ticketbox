package com.ticketbox.notifications.infrastructure.http;

import com.ticketbox.notifications.application.port.PasswordResetMailSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
class IdentityResetMailClient implements PasswordResetMailSource {
    private final RestClient identity;

    IdentityResetMailClient(@Value("${notification.identity-url:}") String url,
            @Value("${notification.identity-token:}") String token) {
        var timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(2000);
        timeouts.setReadTimeout(5000);
        identity = url.isBlank() ? null : RestClient.builder().baseUrl(url).requestFactory(timeouts)
                .defaultHeader("X-Service-Token", token).build();
    }

    public Optional<Message> claim() {
        if (identity == null) return Optional.empty();
        return Optional.ofNullable(identity.post().uri("/internal/split/password-reset/mail/claim")
                .retrieve().body(Message.class));
    }

    public void finish(UUID id, UUID leaseId, boolean delivered) {
        identity.post().uri("/internal/split/password-reset/mail/finish")
                .body(Map.of("id", id, "leaseId", leaseId, "delivered", delivered))
                .retrieve().toBodilessEntity();
    }
}
