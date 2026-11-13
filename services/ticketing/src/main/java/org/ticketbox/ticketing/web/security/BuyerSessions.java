package org.ticketbox.ticketing.web.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class BuyerSessions {
    private final RestClient http;
    private final String identity;

    public BuyerSessions(RestClient http, @Value("${split.identity-url}") String identity) {
        this.http = http;
        this.identity = identity;
    }

    public void require(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        try {
            var result = http.get().uri(identity + "/internal/split/v1/audience-session")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().toBodilessEntity();
            if (result.getStatusCode() != HttpStatus.NO_CONTENT) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        } catch (RestClientResponseException rejected) {
            int status = rejected.getStatusCode().value();
            throw new ResponseStatusException(status == 401 || status == 403
                    ? rejected.getStatusCode() : HttpStatus.SERVICE_UNAVAILABLE);
        } catch (RestClientException unavailable) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}
