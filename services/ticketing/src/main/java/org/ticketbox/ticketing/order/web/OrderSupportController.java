package org.ticketbox.ticketing.order.web;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.order.application.OrderSupportService;
import org.ticketbox.ticketing.order.application.OrderSupportService.SearchPage;
import org.ticketbox.ticketing.order.application.port.OrderSupportQueue;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;

import java.util.UUID;

@RestController
public class OrderSupportController {
    private final OrderSupportService support;

    public OrderSupportController(OrderSupportService support) {
        this.support = support;
    }

    @GetMapping("/api/admin/orders/support")
    ResponseEntity<ApiResponse<SearchPage>> admin(
            @RequestParam(required = false) UUID concertId, @RequestParam(required = false) UUID orderId,
            @RequestParam(required = false) String buyerEmail, @RequestParam(required = false) String transactionRef,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return search(null, concertId, orderId, buyerEmail, transactionRef, page, size);
    }

    @GetMapping("/api/organizer/manage/orders/support")
    @OrganizerPermission(OrganizerPermission.Grant.FINANCE)
    ResponseEntity<ApiResponse<SearchPage>> organizer(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) UUID concertId, @RequestParam(required = false) UUID orderId,
            @RequestParam(required = false) String buyerEmail, @RequestParam(required = false) String transactionRef,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return search(organization, concertId, orderId, buyerEmail, transactionRef, page, size);
    }

    private ResponseEntity<ApiResponse<SearchPage>> search(UUID organization, UUID concert, UUID order,
            String email, String transaction, int page, int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(support.search(organization, concert, order, email, transaction, page, size)));
    }

    @GetMapping("/api/admin/orders/{id}/support/{section}")
    ResponseEntity<ApiResponse<Object>> adminDetail(@PathVariable UUID id, @PathVariable String section) {
        return detail(null, id, section);
    }

    @GetMapping("/api/organizer/manage/orders/{id}/support/{section}")
    @OrganizerPermission(OrganizerPermission.Grant.FINANCE)
    ResponseEntity<ApiResponse<Object>> organizerDetail(@PathVariable UUID id, @PathVariable String section,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization) {
        return detail(organization, id, section);
    }

    private ResponseEntity<ApiResponse<Object>> detail(UUID organization, UUID order, String section) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(support.detail(organization, order, section)));
    }

    @GetMapping("/api/admin/orders/support/queue")
    ResponseEntity<ApiResponse<OrderSupportQueue.Page>> queue(@RequestParam OrderSupportQueue.Kind kind,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(support.queue(kind, page, size)));
    }
}
