package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.TicketTypeService;
import com.ticketbox.module.concert.web.dto.TicketTypeResponse;
import com.ticketbox.module.concert.web.dto.CreateTicketTypeRequest;
import com.ticketbox.module.concert.web.dto.UpdateTicketTypeRequest;
import com.ticketbox.module.concert.web.dto.UpdateTicketTypeStatusRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminTicketTypeController {

    private final TicketTypeService ticketTypeService;

    @GetMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<List<TicketTypeResponse>>> listTicketTypesForAdmin(
            @PathVariable UUID concertId,
            Authentication authentication
    ) {
        List<TicketTypeResponse> list = ticketTypeService.getTicketTypesForAdmin(concertId, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(list));
    }

    @PostMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> createTicketType(
            @PathVariable UUID concertId,
            @Valid @RequestBody CreateTicketTypeRequest request,
            Authentication authentication
    ) {
        TicketTypeResponse created = ticketTypeService.createTicketType(concertId, request, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @PutMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> updateTicketType(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeRequest request,
            Authentication authentication
    ) {
        TicketTypeResponse updated = ticketTypeService.updateTicketType(id, request, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @PatchMapping("/ticket-types/{id}/status")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeStatusRequest request,
            Authentication authentication
    ) {
        TicketTypeResponse updated = ticketTypeService.changeStatus(id, request.isActive(), getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @DeleteMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteTicketType(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        ticketTypeService.deleteTicketType(id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private UUID getUserId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }
}
