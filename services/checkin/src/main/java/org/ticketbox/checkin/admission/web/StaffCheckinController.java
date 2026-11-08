package org.ticketbox.checkin.admission.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.application.dto.ScanTicketRequest;
import org.ticketbox.checkin.admission.application.dto.ScanTicketResponse;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinRequest;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinResponse;
import org.ticketbox.checkin.web.ApiMessages;
import org.ticketbox.checkin.web.ApiResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/staff/checkins")
@RequiredArgsConstructor
public class StaffCheckinController {

    private final CheckinService checkinService;
    private final ApiMessages messages;

    @PostMapping("/scan")
    public ResponseEntity<ApiResponse<ScanTicketResponse>> scan(
            @Valid @RequestBody ScanTicketRequest request, Authentication authentication) {
        UUID staffId = UUID.fromString(authentication.getName());
        var result = checkinService.scan(request, staffId);
        return ResponseEntity.ok(
                ApiResponse.success(
                        new ScanTicketResponse(
                                result.ticketId(),
                                result.concertId(),
                                result.status(),
                                messages.text(result.message(), LocaleContextHolder.getLocale()),
                                result.checkAt())));
    }

    @PostMapping("/sync")
    public ResponseEntity<ApiResponse<SyncCheckinResponse>> sync(
            @Valid @RequestBody SyncCheckinRequest request, Authentication authentication) {
        UUID staffId = UUID.fromString(authentication.getName());
        var result = checkinService.syncOfflineLogs(request, staffId);
        var locale = LocaleContextHolder.getLocale();
        var entries =
                result.results().stream()
                        .map(
                                entry ->
                                        new SyncCheckinResponse.SyncResultEntry(
                                                entry.qrCode(),
                                                entry.result(),
                                                messages.text(entry.reason(), locale)))
                        .toList();
        return ResponseEntity.ok(
                ApiResponse.success(
                        new SyncCheckinResponse(
                                result.total(),
                                result.accepted(),
                                result.skipped(),
                                result.invalid(),
                                entries)));
    }
}
