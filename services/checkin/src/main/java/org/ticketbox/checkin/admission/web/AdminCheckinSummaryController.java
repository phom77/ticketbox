package org.ticketbox.checkin.admission.web;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.application.dto.CheckinSummaryResponse;
import org.ticketbox.checkin.web.ApiResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/concerts")
@RequiredArgsConstructor
public class AdminCheckinSummaryController {

    private final CheckinService checkinService;

    @GetMapping("/{concertId}/checkin-summary")
    public ResponseEntity<ApiResponse<CheckinSummaryResponse>> getCheckinSummary(
            @PathVariable UUID concertId) {
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinSummary(concertId)));
    }
}
