package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.OrderService;
import com.ticketbox.module.ticket.web.dto.OrderResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Admin / Organizer order management.
 * Routes are protected by SecurityConfig: /api/admin/** → ADMIN | ORGANIZER
 */
@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderService orderService;

    /**
     * GET /api/admin/orders?concertId=...&status=PAID
     * List all orders, optionally filtered by concert and/or status.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<OrderResponse>>> listOrders(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) String status) {
        List<OrderResponse> orders = orderService.listAllOrders(concertId, status);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    /**
     * GET /api/admin/orders/{id}
     * Get full detail of any order regardless of owner.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrder(@PathVariable UUID id) {
        OrderResponse order = orderService.getAdminOrderDetail(id);
        return ResponseEntity.ok(ApiResponse.success(order));
    }
}
