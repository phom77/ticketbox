package org.ticketbox.ticketing.issuance.web;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.issuance.application.TicketService;
import org.ticketbox.ticketing.issuance.application.dto.TicketResponse;
import org.ticketbox.ticketing.web.ApiResponse;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
public class TicketController {
    private final TicketService ticketService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<TicketResponse>>> getMyTickets(
            Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(ticketService.listUserTickets(userId)));
    }

    @GetMapping("/my")
    public ResponseEntity<ApiResponse<List<TicketResponse>>> getMyTicketsAlias(
            Authentication authentication) {
        return getMyTickets(authentication);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TicketResponse>> getTicketDetail(
            @PathVariable UUID id, Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(ticketService.getTicketDetail(id, userId)));
    }

    @GetMapping("/{id}/qr")
    public ResponseEntity<ApiResponse<String>> getTicketQrPayload(
            @PathVariable UUID id, Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        TicketResponse detail = ticketService.getTicketDetail(id, userId);
        return ResponseEntity.ok(ApiResponse.success(detail.qrCode()));
    }
}
