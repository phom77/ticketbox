package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.OrderService;
import com.ticketbox.module.ticket.web.dto.CreateOrderRequest;
import com.ticketbox.module.ticket.web.dto.OrderResponse;
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
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<ApiResponse<OrderResponse>> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false)
            String idempotencyKey,
            @RequestHeader(value = "Queue-Access-Token", required = false)
            String queueAccessToken,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        OrderResponse response = orderService.createOrder(request, userId, idempotencyKey, queueAccessToken);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(response));
    }

    @GetMapping("/my")
    public ResponseEntity<ApiResponse<List<OrderResponse>>> listMyOrders(
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        List<OrderResponse> response = orderService.listUserOrders(userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/by-idempotency-key")
    public ResponseEntity<ApiResponse<OrderResponse>> recoverOrder(
            @RequestHeader("Idempotency-Key") String key,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(orderService.getOrderByIdempotencyKey(key, userId)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrder(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        OrderResponse response = orderService.getOrderDetail(id, userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> cancelOrder(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        OrderResponse response = orderService.cancelOrder(id, userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/{id}/retry-payment")
    public ResponseEntity<ApiResponse<OrderResponse>> retryPayment(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        OrderResponse response = orderService.retryPayment(id, userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
