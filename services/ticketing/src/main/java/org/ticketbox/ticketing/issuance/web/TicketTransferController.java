package org.ticketbox.ticketing.issuance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.issuance.application.TicketTransferService;
import org.ticketbox.ticketing.issuance.application.dto.TransferRecipient;
import org.ticketbox.ticketing.issuance.application.dto.TransferState;
import org.ticketbox.ticketing.issuance.application.dto.TransferView;
import org.ticketbox.ticketing.web.ApiResponse;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
public class TicketTransferController {
    private final TicketTransferService transfers;

    public record RecipientRequest(@NotBlank @Size(max = 254) String email) {}

    @GetMapping("/transfers")
    public ResponseEntity<ApiResponse<List<TransferView>>> mine(Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.mine(account(authentication))));
    }

    @GetMapping("/transfers/{transferId}")
    public ResponseEntity<ApiResponse<TransferView>> get(@PathVariable UUID transferId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.get(account(authentication), transferId)));
    }

    @PostMapping("/transfers/{transferId}/accept")
    public ResponseEntity<ApiResponse<TransferView>> accept(@PathVariable UUID transferId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.accept(account(authentication), transferId)));
    }

    @PostMapping("/transfers/{transferId}/decline")
    public ResponseEntity<ApiResponse<TransferView>> decline(@PathVariable UUID transferId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.decline(account(authentication), transferId)));
    }

    @PostMapping("/transfers/{transferId}/cancel")
    public ResponseEntity<ApiResponse<TransferView>> cancel(@PathVariable UUID transferId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.cancel(account(authentication), transferId)));
    }

    @GetMapping("/{ticketId}/transfer-state")
    public ResponseEntity<ApiResponse<TransferState>> state(@PathVariable UUID ticketId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(transfers.state(account(authentication), ticketId)));
    }

    @PostMapping("/{ticketId}/transfer-recipient")
    public ResponseEntity<ApiResponse<TransferRecipient>> recipient(@PathVariable UUID ticketId,
            @Valid @RequestBody RecipientRequest request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                transfers.previewRecipient(account(authentication), ticketId, request.email())));
    }

    @PostMapping("/{ticketId}/transfers")
    public ResponseEntity<ApiResponse<TransferView>> offer(@PathVariable UUID ticketId,
            @Valid @RequestBody RecipientRequest request, Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                transfers.offer(account(authentication), ticketId, request.email())));
    }

    private static UUID account(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
