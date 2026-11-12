package org.ticketbox.ticketing.order.web;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.order.application.OrderService;
import org.ticketbox.ticketing.order.application.dto.OrderResponse;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;

import java.util.List;
import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.FINANCE)
@RequestMapping("/api/organizer/manage/orders")
@RequiredArgsConstructor
public class OrganizerOrderController {

    private final OrderService orderService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<OrderResponse>>> listOrders(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) String status,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        List<OrderResponse> orders =
                orderService.listManagedOrders(
                        concertId, status, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrder(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        OrderResponse order =
                orderService.getManagedOrderDetail(id, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(order));
    }
}
