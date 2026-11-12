package org.ticketbox.identity.organization.web;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.identity.organization.application.OrganizationService;
import org.ticketbox.identity.organization.domain.OrganizationGrant;
import org.ticketbox.identity.web.security.SessionAccess;

import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/internal/split/v1")
class OrganizationAccessController {
    private final OrganizationService organizations;
    private final SessionAccess sessions;

    OrganizationAccessController(OrganizationService organizations, SessionAccess sessions) {
        this.organizations = organizations;
        this.sessions = sessions;
    }

    @GetMapping("/organization-access/{id}")
    ResponseEntity<Access> organization(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        UUID actor = sessions.requireAccount(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new Access(actor, id, organizations.access(actor, id)));
    }

    @GetMapping("/platform-access")
    ResponseEntity<Void> platform(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        sessions.requirePlatformAdmin(authorization);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    record Access(UUID accountId, UUID organizationId, Set<OrganizationGrant> grants) {}
}
