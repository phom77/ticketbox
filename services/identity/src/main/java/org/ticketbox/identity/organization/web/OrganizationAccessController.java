package org.ticketbox.identity.organization.web;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.identity.organization.application.OrganizationProfiles;
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

    private final OrganizationProfiles profiles;

    OrganizationAccessController(OrganizationService organizations, OrganizationProfiles profiles,
            SessionAccess sessions) {
        this.organizations = organizations;
        this.profiles = profiles;
        this.sessions = sessions;
    }

    @GetMapping("/organization-access/{id}")
    ResponseEntity<Access> organization(
            @PathVariable UUID id,
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        var actor = sessions.organizationAccount(authorization);
        var access = organizations.scopedAccess(actor, id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new Access(actor.getId(), id, access.grants(), access.reportingTimezone()));
    }

    @GetMapping("/platform-access")
    ResponseEntity<Void> platform(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        sessions.requirePlatformAdmin(authorization);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/audience-session")
    ResponseEntity<Void> audience(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        sessions.requireAudience(authorization);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/organizations/{id}/name")
    ResponseEntity<DisplayName> displayName(@PathVariable UUID id) {
        return organizations.displayName(id).map(name -> ResponseEntity.ok(new DisplayName(name)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/organizations/{id}/profile")
    ResponseEntity<ProfileContract> profile(@PathVariable UUID id) {
        try {
            var view = profiles.internalView(id);
            var p = view.profile();
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new ProfileContract(id,
                    view.displayName(), p.legalName(), p.taxCode(), p.billingAddress(), p.contactEmail(),
                    p.contactPhone(), p.website(), p.logoUrl(), p.logoPngUrl(), p.reportingTimezone(), p.version()));
        } catch (org.ticketbox.identity.application.error.AppException notFound) {
            return ResponseEntity.notFound().build();
        }
    }

    record DisplayName(String name) {}

    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    record ProfileContract(UUID organizationId, String displayName, String legalName, String taxCode,
                           String billingAddress, String contactEmail, String contactPhone, String website,
                           String logoUrl, String logoPngUrl, String reportingTimezone, long version) {}

    /** The timezone is omitted when the organization has no readable profile; callers fall back to their default. */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    record Access(UUID accountId, UUID organizationId, Set<OrganizationGrant> grants, String reportingTimezone) {}
}
