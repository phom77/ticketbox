package org.ticketbox.checkin.admission.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.application.dto.ScanTicketRequest;
import org.ticketbox.checkin.admission.application.dto.ScanTicketResponse;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinRequest;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinResponse;
import org.ticketbox.checkin.web.ApiResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/staff/checkins")
@RequiredArgsConstructor
public class StaffCheckinController {

    private final CheckinService checkinService;

    @PostMapping("/scan")
    public ResponseEntity<ApiResponse<ScanTicketResponse>> scan(
            @Valid @RequestBody ScanTicketRequest request, Authentication authentication) {
        UUID staffId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(checkinService.scan(request, staffId)));
    }

    @PostMapping("/sync")
    public ResponseEntity<ApiResponse<SyncCheckinResponse>> sync(
            @Valid @RequestBody SyncCheckinRequest request, Authentication authentication) {
        UUID staffId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(
                ApiResponse.success(checkinService.syncOfflineLogs(request, staffId)));
    }
}
