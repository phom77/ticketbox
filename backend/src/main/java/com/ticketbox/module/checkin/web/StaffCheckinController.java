package com.ticketbox.module.checkin.web;

import com.ticketbox.module.checkin.application.CheckinService;
import com.ticketbox.module.checkin.web.dto.ScanTicketRequest;
import com.ticketbox.module.checkin.web.dto.ScanTicketResponse;
import com.ticketbox.module.checkin.web.dto.SyncCheckinRequest;
import com.ticketbox.module.checkin.web.dto.SyncCheckinResponse;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/staff/checkins")
@RequiredArgsConstructor
public class StaffCheckinController {

    private final CheckinService checkinService;

    @PostMapping("/scan")
    public ResponseEntity<ApiResponse<ScanTicketResponse>> scan(
            @Valid @RequestBody ScanTicketRequest request,
            Authentication authentication)
    {
        UUID staffId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(checkinService.scan(request, staffId)));
    }

    @PostMapping("/sync")
    public ResponseEntity<ApiResponse<SyncCheckinResponse>> sync(
            @Valid @RequestBody SyncCheckinRequest request,
            Authentication authentication)
    {
        UUID staffId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(checkinService.syncOfflineLogs(request, staffId)));
    }
}