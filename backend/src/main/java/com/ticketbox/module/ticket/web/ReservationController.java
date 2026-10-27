package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.ReservationService;
import com.ticketbox.module.ticket.domain.TicketHold;
import com.ticketbox.module.ticket.web.dto.ReserveTicketRequest;
import com.ticketbox.module.ticket.web.dto.TicketHoldResponse;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService reservationService;

    @PostMapping("/concerts/{concertId}/ticket-types/{ticketTypeId}/reserve")
    public ResponseEntity<ApiResponse<TicketHoldResponse>> reserve(
            @PathVariable UUID concertId,
            @PathVariable UUID ticketTypeId,
            @Valid @RequestBody ReserveTicketRequest request,
            @RequestHeader(value = "Queue-Access-Token", required = false) String queueAccessToken,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        TicketHold hold = reservationService.reserve(concertId, ticketTypeId, request.getQuantity(), userId, queueAccessToken);
        TicketHoldResponse response = new TicketHoldResponse(hold.getTicketTypeId(), hold.getQuantity(), hold.getExpiresAt());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/concerts/{concertId}/ticket-types/{ticketTypeId}/release")
    public ResponseEntity<ApiResponse<TicketHoldResponse>> release(
            @PathVariable UUID concertId,
            @PathVariable UUID ticketTypeId,
            @Valid @RequestBody ReserveTicketRequest request,
            @RequestHeader(value = "Queue-Access-Token", required = false) String queueAccessToken,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        TicketHold hold = reservationService.release(concertId, ticketTypeId, request.getQuantity(), userId, queueAccessToken);
        TicketHoldResponse response = new TicketHoldResponse(hold.getTicketTypeId(), hold.getQuantity(), hold.getExpiresAt());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/concerts/{concertId}/holds")
    public ResponseEntity<ApiResponse<List<TicketHoldResponse>>> getHolds(
            @PathVariable UUID concertId,
            @RequestHeader(value = "Queue-Access-Token", required = false) String queueAccessToken,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        List<TicketHold> holds = reservationService.getCurrentHolds(concertId, userId, queueAccessToken);
        List<TicketHoldResponse> response = holds.stream()
                .map(hold -> new TicketHoldResponse(hold.getTicketTypeId(), hold.getQuantity(), hold.getExpiresAt()))
                .toList();
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/concerts/{concertId}/holds")
    public ResponseEntity<ApiResponse<Void>> releaseAllHolds(
            @PathVariable UUID concertId,
            @RequestHeader(value = "Queue-Access-Token", required = false) String queueAccessToken,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        reservationService.releaseAllCurrentHolds(concertId, userId, queueAccessToken);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
