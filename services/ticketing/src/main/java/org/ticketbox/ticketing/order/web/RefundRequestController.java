package org.ticketbox.ticketing.order.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.order.application.RefundRequestService;
import org.ticketbox.ticketing.order.application.dto.ManagedRefundRequest;
import org.ticketbox.ticketing.order.application.dto.ManagedRefundRequestPage;
import org.ticketbox.ticketing.order.application.dto.RefundRequestState;
import org.ticketbox.ticketing.order.application.dto.RefundRequestView;
import org.ticketbox.ticketing.order.domain.RefundRequest;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;

import java.util.List;
import java.util.UUID;

@RestController
class RefundRequestController {
    private final RefundRequestService requests;

    RefundRequestController(RefundRequestService requests) {
        this.requests = requests;
    }

    record ReasonRequest(@NotBlank @Size(max = 1000) String reason) {}

    record DecisionNote(@Size(max = 1000) String note) {}

    @GetMapping("/api/orders/{orderId}/refund-request")
    ResponseEntity<ApiResponse<RefundRequestState>> state(@PathVariable UUID orderId, Authentication auth) {
        return noStore(requests.state(account(auth), orderId));
    }

    @PostMapping("/api/orders/{orderId}/refund-requests")
    ResponseEntity<ApiResponse<RefundRequestView>> request(@PathVariable UUID orderId,
            @Valid @RequestBody ReasonRequest body, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(requests.request(account(auth), orderId, body.reason())));
    }

    @PostMapping("/api/orders/{orderId}/refund-requests/{requestId}/withdraw")
    ResponseEntity<ApiResponse<RefundRequestView>> withdraw(@PathVariable UUID orderId, @PathVariable UUID requestId,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(requests.withdraw(account(auth), orderId, requestId)));
    }

    @GetMapping("/api/organizer/manage/refund-requests")
    @OrganizerPermission(OrganizerPermission.Grant.FINANCE)
    ResponseEntity<ApiResponse<ManagedRefundRequestPage>> organizerList(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) List<RefundRequest.Status> status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return noStore(requests.list(organization, status, null, page, size));
    }

    @PostMapping("/api/organizer/manage/refund-requests/{id}/approve")
    @OrganizerPermission(OrganizerPermission.Grant.FINANCE)
    ResponseEntity<ApiResponse<ManagedRefundRequest>> organizerApprove(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization, @PathVariable UUID id,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(requests.approve(organization, account(auth), id)));
    }

    @PostMapping("/api/organizer/manage/refund-requests/{id}/reject")
    @OrganizerPermission(OrganizerPermission.Grant.FINANCE)
    ResponseEntity<ApiResponse<ManagedRefundRequest>> organizerReject(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization, @PathVariable UUID id,
            @Valid @RequestBody DecisionNote body, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(requests.reject(organization, account(auth), id, body.note())));
    }

    /** Platform fallback: lists every organization, and can filter requests the organizer left waiting. */
    @GetMapping("/api/admin/refund-requests")
    ResponseEntity<ApiResponse<ManagedRefundRequestPage>> adminList(
            @RequestParam(required = false) List<RefundRequest.Status> status,
            @RequestParam(required = false) Integer olderThanDays,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return noStore(requests.list(null, status, olderThanDays, page, size));
    }

    @PostMapping("/api/admin/refund-requests/{id}/approve")
    ResponseEntity<ApiResponse<ManagedRefundRequest>> adminApprove(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(requests.approve(null, account(auth), id)));
    }

    @PostMapping("/api/admin/refund-requests/{id}/reject")
    ResponseEntity<ApiResponse<ManagedRefundRequest>> adminReject(@PathVariable UUID id,
            @Valid @RequestBody DecisionNote body, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(requests.reject(null, account(auth), id, body.note())));
    }

    private static <T> ResponseEntity<ApiResponse<T>> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(body));
    }

    private static UUID account(Authentication auth) {
        return UUID.fromString(auth.getName());
    }
}
