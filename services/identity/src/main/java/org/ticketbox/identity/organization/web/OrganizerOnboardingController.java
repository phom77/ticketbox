package org.ticketbox.identity.organization.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.identity.organization.application.OrganizerOnboarding;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Application;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Details;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Link;
import org.ticketbox.identity.organization.domain.OrganizationGrant;
import org.ticketbox.identity.web.ApiResponse;
import org.ticketbox.identity.web.security.SessionAccess;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
class OrganizerOnboardingController {
    record Submission(@NotBlank @Size(max = 100) String token,
                      @NotBlank @Size(max = 160) String organizationName, @NotBlank @Size(max = 160) String managerName,
                      @NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 1000) String firstEvent) {}
    record Activation(@NotBlank @Size(max = 100) String token, @Size(max = 160) String name, @Size(max = 72) String password) {}
    record Invitation(@NotEmpty @Size(max = 50) List<@NotNull @Size(max = 254) String> emails,
                      @NotEmpty Set<@NotNull OrganizationGrant> grants) {}
    record Recipient(@NotBlank @Email @Size(max = 254) String email) {}
    record Outcome(@NotNull UUID id, @NotNull UUID leaseId, boolean delivered) {}

    private final OrganizerOnboarding onboarding;
    private final SessionAccess sessions;

    OrganizerOnboardingController(OrganizerOnboarding onboarding, SessionAccess sessions) {
        this.onboarding = onboarding;
        this.sessions = sessions;
    }

    @PostMapping("/api/admin/organizations/applications/link")
    ResponseEntity<ApiResponse<Map<String, String>>> issue(@RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        sessions.requirePlatformAdmin(auth);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(ApiResponse.created(Map.of("token", onboarding.issueApplication())));
    }

    @PostMapping("/api/auth/organizer/application")
    ResponseEntity<Void> submit(@Valid @RequestBody Submission request) {
        onboarding.submit(request.token(), new Details(request.organizationName(), request.managerName(), request.email(), request.firstEvent()));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/api/admin/organizations/applications")
    ResponseEntity<ApiResponse<List<Application>>> applications(@RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        sessions.requirePlatformAdmin(auth);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(onboarding.applications()));
    }

    @PostMapping("/api/admin/organizations/applications/{id}/approve")
    ApiResponse<Map<String, UUID>> approve(@PathVariable UUID id, @RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        return ApiResponse.success(Map.of("id", onboarding.approve(id, sessions.requirePlatformAdmin(auth))));
    }

    @PostMapping("/api/admin/organizations/applications/{id}/activation")
    ResponseEntity<Void> resendManager(@PathVariable UUID id, @RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        onboarding.resendManager(id, sessions.requirePlatformAdmin(auth));
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/api/organizations/{id}/invitations/email")
    ResponseEntity<ApiResponse<List<Link>>> pending(@PathVariable UUID id, @RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(onboarding.pending(id, sessions.requireOrganizer(auth))));
    }

    @PostMapping("/api/organizations/{id}/invitations/email")
    ApiResponse<List<OrganizerOnboarding.InviteResult>> invite(@PathVariable UUID id,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String auth, @Valid @RequestBody Invitation request) {
        return ApiResponse.success(onboarding.invite(id, sessions.requireOrganizer(auth), request.emails(), request.grants()));
    }

    @PostMapping("/api/organizations/{id}/invitations/email/resend")
    ResponseEntity<Void> resend(@PathVariable UUID id, @RequestHeader(HttpHeaders.AUTHORIZATION) String auth,
            @Valid @RequestBody Recipient request) {
        onboarding.resend(id, sessions.requireOrganizer(auth), request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/api/admin/organizations/{id}/members/{accountId}/migration")
    ApiResponse<OrganizerOnboarding.InviteResult> migrate(@PathVariable UUID id, @PathVariable UUID accountId,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String auth, @Valid @RequestBody Recipient request) {
        return ApiResponse.success(onboarding.migrateMember(id, sessions.requirePlatformAdmin(auth), accountId, request.email()));
    }

    @GetMapping("/api/admin/organizations/{id}/invitations/email")
    ResponseEntity<ApiResponse<List<Link>>> platformPending(@PathVariable UUID id,
            @RequestHeader(HttpHeaders.AUTHORIZATION) String auth) {
        sessions.requirePlatformAdmin(auth);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(onboarding.platformPending(id)));
    }

    @PostMapping("/api/auth/organizer/activate")
    ResponseEntity<Void> activate(@Valid @RequestBody Activation request,
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        onboarding.activate(request.token(), request.name(), request.password(), auth == null ? null : sessions.requireAccount(auth));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/internal/split/organization-links/claim")
    ResponseEntity<OrganizerOnboarding.Mail> claim() {
        return onboarding.claim().map(mail -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mail))
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build());
    }

    @PostMapping("/internal/split/organization-links/finish")
    ResponseEntity<Void> finish(@Valid @RequestBody Outcome request) {
        onboarding.finish(request.id(), request.leaseId(), request.delivered());
        return ResponseEntity.noContent().build();
    }
}
