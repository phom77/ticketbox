package org.ticketbox.ticketing;

import com.ticketbox.module.auth.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import java.util.Optional;
import java.util.UUID;

@Component
public class IdentityContacts implements UserContactPort {
    private final RestClient http;
    private final String identity;

    public IdentityContacts(RestClient http,@Value("${split.identity-url}") String identity) {
        this.http=http;
        this.identity=identity;
    }

    public Optional<UserContactView> findById(UUID id) {
        try {
            return Optional.ofNullable(http.get().uri(identity+"/internal/split/users/"+id).retrieve().body(UserContactView.class));
        } catch (HttpClientErrorException.NotFound absent) {
            return Optional.empty();
        }
    }
}
