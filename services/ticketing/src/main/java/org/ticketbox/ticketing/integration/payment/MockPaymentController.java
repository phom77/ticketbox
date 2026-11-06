package org.ticketbox.ticketing.integration.payment;

import org.ticketbox.ticketing.web.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/mock-payments")
@RequiredArgsConstructor
@Profile("!prod")
public class MockPaymentController {
    private final RemotePaymentOperations paymentService;

    @PostMapping("/{orderId}/success")
    public ResponseEntity<ApiResponse<Void>> mockSuccess(@PathVariable UUID orderId, org.springframework.security.core.Authentication auth) {
        paymentService.getPaymentStatus(orderId, UUID.fromString(auth.getName()));
        paymentService.processMockPaymentSuccess(orderId);
        return ResponseEntity.ok(ApiResponse.success(null, "Mock payment success processed successfully"));
    }

    @PostMapping("/{orderId}/fail")
    public ResponseEntity<ApiResponse<Void>> mockFail(@PathVariable UUID orderId, org.springframework.security.core.Authentication auth) {
        paymentService.getPaymentStatus(orderId, UUID.fromString(auth.getName()));
        paymentService.processMockPaymentFail(orderId);
        return ResponseEntity.ok(ApiResponse.success(null, "Mock payment failure processed successfully"));
    }
}
