package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionRequests;
import org.ticketbox.catalog.performance.application.PerformanceSalesControls;
import org.ticketbox.catalog.performance.application.SalesControlStore.Request;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

/** Pause and resume of sales and cancel or postpone requests for a released performance. */
@RestController
@RequestMapping("/api/organizer/manage/v2/performances/{id}")
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
public class OrganizerSalesController {
    private final PerformanceSalesControls sales;
    private final PerformanceDisruptionRequests requests;

    public OrganizerSalesController(PerformanceSalesControls sales, PerformanceDisruptionRequests requests) {
        this.sales = sales;
        this.requests = requests;
    }

    @GetMapping("/sales")
    public ResponseEntity<ApiResponse<PerformanceSalesControls.SalesState>> state(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(sales.state(owner, id)));
    }

    @PostMapping("/sales/pause")
    public ApiResponse<PerformanceSalesControls.PauseStatus> pause(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody PauseRequest request) {
        return ApiResponse.success(sales.pause(owner, actor(actor), id, request.actionId(), request.reason()));
    }

    @PostMapping("/sales/resume")
    public ApiResponse<PerformanceSalesControls.PauseStatus> resume(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody ResumeRequest request) {
        return ApiResponse.success(sales.resume(owner, actor(actor), id, request.pauseId()));
    }

    @GetMapping("/disruption-requests")
    public ResponseEntity<ApiResponse<List<Request>>> list(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(requests.list(owner, id)));
    }

    @PostMapping("/disruption-requests")
    public ApiResponse<Request> create(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody DisruptionRequest request) {
        return ApiResponse.success(requests.create(owner, actor(actor), id, new PerformanceDisruptionRequests.Command(
                request.kind(), request.reason(), request.proposedStartsAt(), request.proposedEndsAt(),
                request.proposedDoorsOpenAt(), Boolean.TRUE.equals(request.alsoPause()))));
    }

    @PostMapping("/disruption-requests/{requestId}/withdraw")
    public ApiResponse<Request> withdraw(
            @PathVariable UUID id, @PathVariable UUID requestId,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor) {
        return ApiResponse.success(requests.withdraw(owner, actor(actor), id, requestId));
    }

    private static UUID actor(Principal actor) {
        return UUID.fromString(actor.getName());
    }

    record PauseRequest(UUID actionId, String reason) {}
    record ResumeRequest(UUID pauseId) {}
    record DisruptionRequest(String kind, String reason, OffsetDateTime proposedStartsAt, OffsetDateTime proposedEndsAt,
                             OffsetDateTime proposedDoorsOpenAt, Boolean alsoPause) {}
}
