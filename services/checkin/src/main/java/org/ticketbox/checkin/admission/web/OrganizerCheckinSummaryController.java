package org.ticketbox.checkin.admission.web;

import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.web.dto.CheckinSummaryResponse;
import org.ticketbox.checkin.integration.catalog.LocalConcertProjection;
import org.ticketbox.checkin.web.AppException;
import org.ticketbox.checkin.web.ErrorCode;
import org.ticketbox.checkin.web.ApiResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exposes the same operational check-in snapshot to the organizer that owns the concert. */
@RestController
@RequestMapping("/api/organizer/manage/concerts")
@RequiredArgsConstructor
public class OrganizerCheckinSummaryController {

    private final LocalConcertProjection concerts;
    private final CheckinService checkinService;

    @GetMapping("/{concertId}/checkin-summary")
    public ResponseEntity<ApiResponse<CheckinSummaryResponse>> getCheckinSummary(
            @PathVariable UUID concertId,
            Authentication authentication) {
        if (!concerts.isOwnedBy(concertId, UUID.fromString(authentication.getName()))) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinSummary(concertId)));
    }
}
