package org.ticketbox.checkin.admission.web;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.application.dto.OrganizerAdmissionResponse;
import org.ticketbox.checkin.admission.application.port.ConcertAccess;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.web.ApiResponse;
import org.ticketbox.checkin.web.security.OrganizationAccess;
import org.ticketbox.checkin.web.security.OrganizerPermission;

import java.util.UUID;

/** Newest admissions of one native performance for its owning organizer; never exposes QR values or device ids. */
@RestController
@Validated
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping("/api/organizer/manage/v2/performances")
@RequiredArgsConstructor
public class OrganizerPerformanceAdmissionsController {

    private final ConcertAccess concerts;
    private final CheckinService checkinService;

    @GetMapping("/{performanceId}/checkins")
    public ResponseEntity<ApiResponse<Page<OrganizerAdmissionResponse>>> admissions(
            @PathVariable UUID performanceId,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int size) {
        if (!concerts.isOwnedBy(performanceId, organizationId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
        }
        return ResponseEntity.ok(ApiResponse.success(checkinService.getOrganizerAdmissions(
                performanceId, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "checkedAt", "id")))));
    }
}
