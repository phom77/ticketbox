package org.ticketbox.identity.organization.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
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
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
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
        UUID actor = sessions.requirePlatformAdmin(authorization);
        boolean hasEmail = request.email() != null && !request.email().isBlank();
        if ((request.accountId() != null) == hasEmail) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        if (hasEmail) organizations.recoverByEmail(actor, id, request.email());
        else organizations.recover(actor, id, request.accountId());
        return ApiResponse.success(null);
    }

    @GetMapping("/api/organizations")
    ApiResponse<List<Membership>> memberships(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return ApiResponse.success(organizations.memberships(sessions.organizationAccount(authorization)));
    }

    @GetMapping("/api/admin/organizations/{id}/members")
    ApiResponse<List<Member>> platformMembers(@PathVariable UUID id,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        sessions.requirePlatformAdmin(authorization);
        return ApiResponse.success(organizations.platformMembers(id));
    }

    @PutMapping("/api/admin/organizations/{id}/members/{accountId}/status")
    ResponseEntity<Void> platformMemberActivity(@PathVariable UUID id, @PathVariable UUID accountId,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @Valid @RequestBody MemberActivity request) {
        organizations.setMemberActivity(sessions.requirePlatformAdmin(authorization), id, accountId, request.active());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/organizations/{id}/members")
    ApiResponse<List<Member>> members(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        return ApiResponse.success(organizations.members(sessions.requireOrganizer(authorization), id));
    }

    @GetMapping("/api/organizations/{id}/admission-staff")
    ResponseEntity<ApiResponse<List<OrganizationService.AdmissionStaff>>> admissionStaff(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        var staff = organizations.admissionStaff(sessions.requireOrganizer(authorization), id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(staff));
    }

    @PostMapping("/api/organizations/{id}/invitations")
    ResponseEntity<ApiResponse<OrganizationService.InviteCode>> invite(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody Invitation request) {
        var invite = organizations.invite(
                sessions.requireOrganizer(authorization), id, request.accountId(), request.grants());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(ApiResponse.created(invite));
    }

    @PostMapping("/api/organizations/invitations/accept")
    ApiResponse<OrganizationId> accept(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody InvitationCode request) {
        UUID id = organizations.accept(sessions.organizationAccount(authorization).getId(), request.code());
        return ApiResponse.success(new OrganizationId(id));
    }

    @PutMapping("/api/organizations/{id}/members/{accountId}")
    ApiResponse<Void> update(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @PathVariable UUID accountId,
            @Valid @RequestBody MemberGrants request) {
        organizations.updateMember(sessions.requireOrganizer(authorization), id, accountId, request.grants());
        return ApiResponse.success(null);
    }

    record Approval(@NotBlank @Size(max = 160) String name, @NotNull UUID initialManagerId) {}

    record Manager(UUID accountId, @Email @Size(max = 254) String email) {}

    record Invitation(@NotNull UUID accountId, @NotEmpty Set<@NotNull OrganizationGrant> grants) {}

    record InvitationCode(@NotBlank @Size(min = 36, max = 36) String code) {}

    record MemberGrants(@NotNull Set<@NotNull OrganizationGrant> grants) {}

    record MemberActivity(@NotNull Boolean active) {}

    record OrganizationId(UUID id) {}
}
