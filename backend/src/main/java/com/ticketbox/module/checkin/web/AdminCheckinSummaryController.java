package com.ticketbox.module.checkin.web;

import com.ticketbox.module.checkin.application.CheckinService;
import com.ticketbox.module.checkin.web.dto.CheckinSummaryResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/concerts")
@RequiredArgsConstructor
public class AdminCheckinSummaryController {

    private final CheckinService checkinService;

    @GetMapping("/{concertId}/checkin-summary")
    public ResponseEntity<ApiResponse<CheckinSummaryResponse>> getCheckinSummary(@PathVariable UUID concertId) {
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinSummary(concertId)));
    }
}
