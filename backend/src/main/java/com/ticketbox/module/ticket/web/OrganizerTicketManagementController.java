package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.TicketService;
import com.ticketbox.module.ticket.web.dto.TicketResponse;
import com.ticketbox.shared.response.ApiResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/organizer/manage")
@RequiredArgsConstructor
public class OrganizerTicketManagementController {

    private final TicketService ticketService;

    @GetMapping("/concerts/{concertId}/tickets")
    public ResponseEntity<ApiResponse<List<TicketResponse>>> listConcertTickets(
            @PathVariable UUID concertId,
            @RequestParam(required = false) String status,
            Authentication authentication) {
        List<TicketResponse> tickets = ticketService.listConcertTickets(
                concertId,
                status,
                currentUserId(authentication),
                false);
        return ResponseEntity.ok(ApiResponse.success(tickets));
    }

    @PatchMapping("/tickets/{id}/status")
    public ResponseEntity<ApiResponse<TicketResponse>> updateTicketStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            Authentication authentication) {
        TicketResponse ticket = ticketService.updateTicketStatus(
                id,
                body.get("status"),
                currentUserId(authentication),
                false);
        return ResponseEntity.ok(ApiResponse.success(ticket));
    }

    private UUID currentUserId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
