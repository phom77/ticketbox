package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.TicketService;
import com.ticketbox.module.ticket.web.dto.TicketResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin / Organizer ticket management.
 * Routes are protected by SecurityConfig: /api/admin/** → ADMIN | ORGANIZER
 */
@RestController
@RequiredArgsConstructor
public class AdminTicketController {

    private final TicketService ticketService;

    /**
     * GET /api/admin/concerts/{concertId}/tickets?status=VALID
     * List all tickets for a concert, optionally filtered by status.
     * Status values: VALID | USED | CANCELLED | TRANSFERRED
     */
    @GetMapping("/api/admin/concerts/{concertId}/tickets")
    public ResponseEntity<ApiResponse<List<TicketResponse>>> listConcertTickets(
            @PathVariable UUID concertId,
            @RequestParam(required = false) String status) {
        List<TicketResponse> tickets = ticketService.listConcertTickets(concertId, status);
        return ResponseEntity.ok(ApiResponse.success(tickets));
    }

    /**
     * PATCH /api/admin/tickets/{id}/status
     * Update a ticket's status. Body: { "status": "CANCELLED" }
     * Allowed status transitions: VALID → CANCELLED, VALID → TRANSFERRED
     */
    @PatchMapping("/api/admin/tickets/{id}/status")
    public ResponseEntity<ApiResponse<TicketResponse>> updateTicketStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String newStatus = body.get("status");
        TicketResponse ticket = ticketService.updateTicketStatus(id, newStatus);
        return ResponseEntity.ok(ApiResponse.success(ticket));
    }
}
