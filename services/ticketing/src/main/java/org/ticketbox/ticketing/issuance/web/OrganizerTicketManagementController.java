package org.ticketbox.ticketing.issuance.web;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.issuance.application.TicketService;
import org.ticketbox.ticketing.issuance.application.dto.TicketResponse;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.FINANCE)
@RequestMapping("/api/organizer/manage")
@RequiredArgsConstructor
public class OrganizerTicketManagementController {

    private final TicketService ticketService;

    @GetMapping("/concerts/{concertId}/tickets")
    public ResponseEntity<ApiResponse<List<TicketResponse>>> listConcertTickets(
            @PathVariable UUID concertId,
            @RequestParam(required = false) String status,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        List<TicketResponse> tickets =
                ticketService.listConcertTickets(
                        concertId, status, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(tickets));
    }

    @OrganizerPermission(OrganizerPermission.Grant.EVENTS)
    @PatchMapping("/tickets/{id}/status")
    public ResponseEntity<ApiResponse<TicketResponse>> updateTicketStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        TicketResponse ticket =
                ticketService.updateTicketStatus(
                        id, body.get("status"), organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(ticket));
    }
}
