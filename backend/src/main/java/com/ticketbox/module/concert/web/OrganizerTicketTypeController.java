package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.TicketTypeService;
import com.ticketbox.module.concert.web.dto.CreateTicketTypeRequest;
import com.ticketbox.module.concert.web.dto.TicketTypeResponse;
import com.ticketbox.module.concert.web.dto.UpdateTicketTypeRequest;
import com.ticketbox.module.concert.web.dto.UpdateTicketTypeStatusRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/organizer/manage")
@RequiredArgsConstructor
public class OrganizerTicketTypeController {

    private final TicketTypeService ticketTypeService;

    @GetMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<List<TicketTypeResponse>>> list(
            @PathVariable UUID concertId,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                ticketTypeService.getTicketTypesForAdmin(concertId, userId(authentication), false)));
    }

    @PostMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> create(
            @PathVariable UUID concertId,
            @Valid @RequestBody CreateTicketTypeRequest request,
            Authentication authentication) {
        TicketTypeResponse created = ticketTypeService.createTicketType(
                concertId, request, userId(authentication), false);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @PutMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                ticketTypeService.updateTicketType(id, request, userId(authentication), false)));
    }

    @PatchMapping("/ticket-types/{id}/status")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeStatusRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                ticketTypeService.changeStatus(id, request.isActive(), userId(authentication), false)));
    }

    @DeleteMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable UUID id,
            Authentication authentication) {
        ticketTypeService.deleteTicketType(id, userId(authentication), false);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
