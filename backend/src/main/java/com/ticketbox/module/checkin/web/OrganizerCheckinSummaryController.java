package com.ticketbox.module.checkin.web;

import com.ticketbox.module.checkin.application.CheckinService;
import com.ticketbox.module.checkin.web.dto.CheckinSummaryResponse;
import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.response.ApiResponse;
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

    private final ConcertOrderPort concertOrderPort;
    private final CheckinService checkinService;

    @GetMapping("/{concertId}/checkin-summary")
    public ResponseEntity<ApiResponse<CheckinSummaryResponse>> getCheckinSummary(
            @PathVariable UUID concertId,
            Authentication authentication) {
        if (!concertOrderPort.isConcertOwnedBy(concertId, UUID.fromString(authentication.getName()))) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinSummary(concertId)));
    }
}
