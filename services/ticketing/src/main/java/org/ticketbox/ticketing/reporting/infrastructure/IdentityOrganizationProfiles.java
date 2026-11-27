package org.ticketbox.ticketing.reporting.infrastructure;

import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.reporting.application.port.OrganizationProfiles;

import java.util.UUID;

/** Reads identity.organization-profile.v1 with the service token. Any failure means Identity is unavailable. */
@Slf4j
@Component
class IdentityOrganizationProfiles implements OrganizationProfiles {
    private final RestClient http;
    private final String identity;

    IdentityOrganizationProfiles(RestClient serviceClient, @Value("${split.identity-url}") String identity) {
        this.http = serviceClient;
        this.identity = identity;
    }

    @Override
    public Profile fetch(UUID organizationId) {
        try {
            Profile profile = http.get().uri(identity + "/internal/split/v1/organizations/{id}/profile", organizationId)
                    .retrieve().body(Profile.class);
            if (profile == null || !organizationId.equals(profile.organizationId())) {
                throw unavailable();
            }
            return profile;
        } catch (RestClientException failure) {
            log.warn("Organization profile unavailable for {}: {}", organizationId, failure.getMessage());
            throw unavailable();
        }
    }

    private static AppException unavailable() {
        return new AppException(ErrorCode.STATEMENT_PROFILE_UNAVAILABLE, "error.statement.profile-unavailable");
    }
}
