package com.ticketbox.module.ticket.web;

import com.ticketbox.module.ticket.application.OrderService;
import com.ticketbox.module.ticket.web.dto.OrderResponse;
import com.ticketbox.shared.response.ApiResponse;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/organizer/manage/orders")
@RequiredArgsConstructor
public class OrganizerOrderController {

    private final OrderService orderService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<OrderResponse>>> listOrders(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) String status,
            Authentication authentication) {
        List<OrderResponse> orders = orderService.listManagedOrders(
                concertId,
                status,
                currentUserId(authentication),
                false);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrder(
            @PathVariable UUID id,
            Authentication authentication) {
        OrderResponse order = orderService.getManagedOrderDetail(
                id,
                currentUserId(authentication),
                false);
        return ResponseEntity.ok(ApiResponse.success(order));
    }

    private UUID currentUserId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
