package org.ticketbox.checkin.admission.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.admission.application.StaffAdmission;
import org.ticketbox.checkin.admission.application.dto.CheckinHistoryResponse;
import org.ticketbox.checkin.admission.application.dto.ScanTicketRequest;
import org.ticketbox.checkin.admission.application.dto.ScanTicketResponse;
import org.ticketbox.checkin.admission.application.dto.StaffConcertOverviewResponse;
import org.ticketbox.checkin.admission.application.dto.StaffConcertResponse;
import org.ticketbox.checkin.admission.application.dto.StaffTicketResponse;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinRequest;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinResponse;
import org.ticketbox.checkin.guestlist.application.dto.GuestLookupResponse;
import org.ticketbox.checkin.web.ApiMessages;
import org.ticketbox.checkin.web.ApiResponse;
import org.ticketbox.checkin.web.security.OrganizationAccess;
import org.ticketbox.checkin.web.security.OrganizerPermission;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v2/staff/performances")
@OrganizerPermission(OrganizerPermission.Grant.ADMISSION)
@Validated
class ScopedStaffCheckinController {
    private final StaffAdmission admission;
    private final ApiMessages messages;

    ScopedStaffCheckinController(StaffAdmission admission, ApiMessages messages) {
        this.admission = admission;
        this.messages = messages;
    }

    @GetMapping
    ApiResponse<Page<StaffConcertResponse>> performances(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(admission.performances(organization, actor(auth), PageRequest.of(page, size)));
    }

    @GetMapping("/{id}/overview")
    ApiResponse<StaffConcertOverviewResponse> overview(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id) {
        return ApiResponse.success(admission.overview(organization, actor(auth), id));
    }

    @GetMapping("/{id}/checkin-dataset")
    ApiResponse<StaffAdmission.Dataset> dataset(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id) {
        return ApiResponse.success(admission.dataset(organization, actor(auth), id));
    }

    @GetMapping("/{id}/tickets")
    ApiResponse<Page<StaffTicketResponse>> tickets(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id,
            @RequestParam(required = false) @Size(max = 500) String query,
            @RequestParam(required = false) @Pattern(regexp = "VALID|USED|CANCELLED|TRANSFERRED") String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(admission.tickets(organization, actor(auth), id, query, status,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "issuedAt"))));
    }

    @GetMapping("/{id}/checkins")
    ApiResponse<Page<CheckinHistoryResponse>> history(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(admission.history(organization, actor(auth), id,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "checkedAt", "id"))));
    }

    @GetMapping("/{id}/guests")
    ApiResponse<Page<GuestLookupResponse>> guests(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.success(admission.guests(organization, actor(auth), id,
                PageRequest.of(page, size, Sort.by("id"))));
    }

    @PostMapping("/{id}/guests/{guestId}/check-in")
    ApiResponse<GuestLookupResponse> checkInGuest(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id, @PathVariable UUID guestId,
            @Valid @RequestBody GuestScan body) {
        return ApiResponse.success(admission.checkInGuest(organization, actor(auth), id, guestId, body.gate()));
    }

    @PostMapping("/{id}/scan")
    ApiResponse<ScanTicketResponse> scan(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id, @Valid @RequestBody ScanBody body) {
        var result = admission.scan(organization, actor(auth),
                new ScanTicketRequest(body.qrCode(), id, body.deviceId(), body.gate()));
        return ApiResponse.success(new ScanTicketResponse(
                result.ticketId(), result.concertId(), result.status(),
                messages.text(result.message(), LocaleContextHolder.getLocale()), result.checkAt()));
    }

    @PostMapping("/{id}/sync")
    ApiResponse<SyncCheckinResponse> sync(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            Authentication auth, @PathVariable UUID id, @Valid @RequestBody SyncBody body) {
        var logs = body.logs().stream()
                .map(entry -> new SyncCheckinRequest.OfflineLogEntry(
                        entry.qrCode(), entry.checkedAt(), entry.gate(), entry.notes()))
                .toList();
        var result = admission.sync(organization, actor(auth), new SyncCheckinRequest(id, body.deviceId(), logs));
        var locale = LocaleContextHolder.getLocale();
        var entries = result.results().stream()
                .map(entry -> new SyncCheckinResponse.SyncResultEntry(
                        entry.qrCode(), entry.result(), messages.text(entry.reason(), locale)))
                .toList();
        return ApiResponse.success(new SyncCheckinResponse(
                result.total(), result.accepted(), result.skipped(), result.invalid(), entries));
    }

    private UUID actor(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    record GuestScan(@Size(max = 100) String gate) {}

    record ScanBody(
            @NotBlank @Size(max = 500) String qrCode,
            @NotBlank @Size(max = 255) String deviceId,
            @Size(max = 100) String gate) {}

    record SyncBody(
            @NotBlank @Size(max = 255) String deviceId,
            @NotNull @Size(min = 1, max = 500) List<@NotNull @Valid OfflineScan> logs) {}

    record OfflineScan(
            @NotBlank @Size(max = 500) String qrCode,
            @NotNull OffsetDateTime checkedAt,
            @Size(max = 100) String gate,
            @Size(max = 500) String notes) {}
}
