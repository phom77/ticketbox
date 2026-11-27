package org.ticketbox.identity.organization.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.organization.application.OrganizationProfiles;
import org.ticketbox.identity.organization.application.OrganizationProfiles.ProfileConflict;
import org.ticketbox.identity.organization.application.OrganizationProfiles.View;
import org.ticketbox.identity.web.ApiResponse;
import org.ticketbox.identity.web.security.SessionAccess;

import java.io.IOException;
import java.util.UUID;

@RestController
class OrganizationProfileController {
    private final OrganizationProfiles profiles;
    private final SessionAccess sessions;

    OrganizationProfileController(OrganizationProfiles profiles, SessionAccess sessions) {
        this.profiles = profiles;
        this.sessions = sessions;
    }

    @GetMapping("/api/organizations/{id}/profile")
    ResponseEntity<ApiResponse<ProfileResponse>> get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id) {
        return ok(profiles.view(sessions.requireOrganizer(authorization), id));
    }

    @GetMapping("/api/admin/organizations/{id}/profile")
    ResponseEntity<ApiResponse<ProfileResponse>> platform(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        sessions.requirePlatformAdmin(authorization);
        return ok(profiles.platformView(id));
    }

    @PutMapping("/api/organizations/{id}/profile")
    ResponseEntity<ApiResponse<ProfileResponse>> update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody ContactRequest request) {
        return ok(profiles.updateProfile(sessions.requireOrganizer(authorization), id,
                new OrganizationProfiles.ContactChanges(request.contactEmail(), request.contactPhone(),
                        request.website(), request.reportingTimezone()), request.version()));
    }

    @PutMapping("/api/organizations/{id}/profile/statement-details")
    ResponseEntity<ApiResponse<ProfileResponse>> statementDetails(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @Valid @RequestBody StatementDetailsRequest request) {
        return ok(profiles.updateStatementDetails(sessions.requireOrganizer(authorization), id,
                new OrganizationProfiles.StatementDetailChanges(request.legalName(), request.taxCode(),
                        request.billingAddress()), request.version()));
    }

    @PutMapping("/api/organizations/{id}/profile/logo")
    ResponseEntity<ApiResponse<ProfileResponse>> replaceLogo(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @RequestParam("file") MultipartFile file, @RequestParam("version") long version) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.logo.required");
        }
        return ok(profiles.replaceLogo(sessions.requireOrganizer(authorization), id,
                new OrganizationProfiles.LogoUpload(file.getContentType(), bytes), version));
    }

    @DeleteMapping("/api/organizations/{id}/profile/logo")
    ResponseEntity<ApiResponse<ProfileResponse>> removeLogo(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @RequestParam("version") long version) {
        return ok(profiles.removeLogo(sessions.requireOrganizer(authorization), id, version));
    }

    @ExceptionHandler(ProfileConflict.class)
    ResponseEntity<ApiResponse<ProfileResponse>> conflict(ProfileConflict conflict) {
        return ResponseEntity.status(409).cacheControl(CacheControl.noStore())
                .body(ApiResponse.failure(409, "error.conflict", ProfileResponse.of(conflict.current())));
    }

    private ResponseEntity<ApiResponse<ProfileResponse>> ok(View view) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(ProfileResponse.of(view)));
    }

    record ContactRequest(
            @Email(message = "{validation.email.invalid}") @Size(max = 254, message = "{validation.profile.too-long}")
            String contactEmail,
            @Size(max = 32, message = "{validation.profile.too-long}")
            @Pattern(regexp = "^[0-9 +()-]*$", message = "{validation.profile.phone.invalid}") String contactPhone,
            @Size(max = 2048, message = "{validation.profile.too-long}")
            @Pattern(regexp = "^(https://\\S+)?$", message = "{validation.profile.website.invalid}") String website,
            @IanaTimezone String reportingTimezone,
            @NotNull(message = "{validation.profile.version.required}") Long version) {}

    record StatementDetailsRequest(
            @Size(max = 200, message = "{validation.profile.too-long}") String legalName,
            @Pattern(regexp = "^([0-9]{10}(-[0-9]{3})?)?$", message = "{validation.profile.tax-code.invalid}")
            String taxCode,
            @Size(max = 500, message = "{validation.profile.too-long}") String billingAddress,
            @NotNull(message = "{validation.profile.version.required}") Long version) {}

    record ProfileResponse(UUID organizationId, String displayName, String logoUrl, String contactEmail,
                           String contactPhone, String website, String legalName, String taxCode,
                           String billingAddress, String reportingTimezone, long version, boolean canEditProfile,
                           boolean canEditStatementDetails) {
        static ProfileResponse of(View view) {
            var p = view.profile();
            return new ProfileResponse(p.organizationId(), view.displayName(), p.logoUrl(), p.contactEmail(),
                    p.contactPhone(), p.website(), p.legalName(), p.taxCode(), p.billingAddress(),
                    p.reportingTimezone(), p.version(), view.canEditProfile(), view.canEditStatementDetails());
        }
    }
}
