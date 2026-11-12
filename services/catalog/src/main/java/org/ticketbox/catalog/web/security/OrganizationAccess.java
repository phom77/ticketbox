package org.ticketbox.catalog.web.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Arrays;
import java.util.Set;
import java.util.UUID;

public final class OrganizationAccess implements HandlerInterceptor {
    public static final String ORGANIZATION = "authorizedOrganizationId";
    private static final String SCOPE_HEADER = "X-Organization-Id";

    private final RestClient http;
    private final String identity;

    public OrganizationAccess(RestClient http, String identity) {
        this.http = http;
        this.identity = identity;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }

        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || request.getUserPrincipal() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        String mapping = String.valueOf(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE));

        try {
            if (mapping.startsWith("/api/admin")) {
                requirePlatformAccess(authorization);
            } else {
                UUID organization = requireOrganizationAccess(request, method, authorization);
                request.setAttribute(ORGANIZATION, organization);
            }
        } catch (RestClientResponseException failure) {
            if (failure.getStatusCode().value() == 401 || failure.getStatusCode().value() == 403) {
                throw new ResponseStatusException(failure.getStatusCode());
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        } catch (RestClientException failure) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        return true;
    }

    private void requirePlatformAccess(String authorization) {
        var result = http.get().uri(identity + "/internal/split/v1/platform-access")
                .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().toBodilessEntity();
        if (result.getStatusCode() != HttpStatus.NO_CONTENT) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private UUID requireOrganizationAccess(HttpServletRequest request, HandlerMethod method, String authorization) {
        OrganizerPermission permission = method.getMethodAnnotation(OrganizerPermission.class);
        if (permission == null) {
            permission = method.getBeanType().getAnnotation(OrganizerPermission.class);
        }
        if (permission == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        UUID organization = selectedOrganization(request);
        Access access = http.get().uri(identity + "/internal/split/v1/organization-access/{id}", organization)
                .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(Access.class);
        if (access == null || !organization.equals(access.organizationId()) || access.accountId() == null
                || !access.accountId().toString().equals(request.getUserPrincipal().getName())
                || access.grants() == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (Arrays.stream(permission.value()).map(Enum::name).noneMatch(access.grants()::contains)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return organization;
    }

    private UUID selectedOrganization(HttpServletRequest request) {
        String value = request.getHeader(SCOPE_HEADER);
        if (value == null || value.length() != 36) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
    }

    private record Access(UUID accountId, UUID organizationId, Set<String> grants) {}
}
