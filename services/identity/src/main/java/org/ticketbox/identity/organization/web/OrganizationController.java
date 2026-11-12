package org.ticketbox.identity.organization.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.identity.organization.application.OrganizationService;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Member;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Membership;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Organization;
import org.ticketbox.identity.organization.domain.OrganizationGrant;
import org.ticketbox.identity.web.ApiResponse;
import org.ticketbox.identity.web.security.SessionAccess;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
class OrganizationController {
    private final OrganizationService organizations;
    private final SessionAccess sessions;

    OrganizationController(OrganizationService organizations, SessionAccess sessions) {
        this.organizations = organizations;
        this.sessions = sessions;
    }

    @GetMapping("/api/admin/organizations")
    ApiResponse<List<Organization>> approved(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        sessions.requirePlatformAdmin(authorization);
        return ApiResponse.success(organizations.organizations());
    }

    @PostMapping("/api/admin/organizations")
    ResponseEntity<ApiResponse<OrganizationId>> approve(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody Approval request) {
        UUID actor = sessions.requirePlatformAdmin(authorization);
        UUID id = organizations.approve(actor, request.name(), request.initialManagerId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(new OrganizationId(id)));
    }

    @PutMapping("/api/admin/organizations/{id}/manager")
    ApiResponse<Void> recover(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody Manager request) {
        organizations.recover(sessions.requirePlatformAdmin(authorization), id, request.accountId());
        return ApiResponse.success(null);
    }

    @GetMapping("/api/organizations")
    ApiResponse<List<Membership>> memberships(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return ApiResponse.success(organizations.memberships(sessions.requireAccount(authorization)));
    }

    @GetMapping("/api/organizations/{id}/members")
    ApiResponse<List<Member>> members(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        return ApiResponse.success(organizations.members(sessions.requireAccount(authorization), id));
    }

    @PostMapping("/api/organizations/{id}/invitations")
    ResponseEntity<ApiResponse<OrganizationService.InviteCode>> invite(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody Invitation request) {
        var invite = organizations.invite(
                sessions.requireAccount(authorization), id, request.accountId(), request.grants());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(ApiResponse.created(invite));
    }

    @PostMapping("/api/organizations/invitations/accept")
    ApiResponse<OrganizationId> accept(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody InvitationCode request) {
        UUID id = organizations.accept(sessions.requireAccount(authorization), request.code());
        return ApiResponse.success(new OrganizationId(id));
    }

    @PutMapping("/api/organizations/{id}/members/{accountId}")
    ApiResponse<Void> update(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @PathVariable UUID accountId,
            @Valid @RequestBody MemberGrants request) {
        organizations.updateMember(sessions.requireAccount(authorization), id, accountId, request.grants());
        return ApiResponse.success(null);
    }

    record Approval(@NotBlank @Size(max = 160) String name, @NotNull UUID initialManagerId) {}

    record Manager(@NotNull UUID accountId) {}

    record Invitation(@NotNull UUID accountId, @NotEmpty Set<@NotNull OrganizationGrant> grants) {}

    record InvitationCode(@NotBlank @Size(min = 36, max = 36) String code) {}

    record MemberGrants(@NotNull Set<@NotNull OrganizationGrant> grants) {}

    record OrganizationId(UUID id) {}
}
