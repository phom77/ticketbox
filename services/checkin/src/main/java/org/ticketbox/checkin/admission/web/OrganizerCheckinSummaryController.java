package org.ticketbox.checkin.admission.web;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.application.dto.CheckinSummaryResponse;
import org.ticketbox.checkin.admission.application.port.ConcertAccess;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.web.ApiResponse;
import org.ticketbox.checkin.web.security.OrganizationAccess;
import org.ticketbox.checkin.web.security.OrganizerPermission;

import java.util.UUID;

/** Exposes the same operational check-in snapshot to the organizer that owns the concert. */
@RestController
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping("/api/organizer/manage/concerts")
@RequiredArgsConstructor
public class OrganizerCheckinSummaryController {

    private final ConcertAccess concerts;
    private final CheckinService checkinService;

    @GetMapping("/{concertId}/checkin-summary")
    public ResponseEntity<ApiResponse<CheckinSummaryResponse>> getCheckinSummary(
            @PathVariable UUID concertId, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        if (!concerts.isOwnedBy(concertId, organizationId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
        }
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinSummary(concertId)));
    }
}
