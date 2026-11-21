package org.ticketbox.ticketing.performance.web;

import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.order.application.OrderService;
import org.ticketbox.ticketing.order.application.dto.OrderResponse;
import org.ticketbox.ticketing.performance.application.PerformanceAvailability;
import org.ticketbox.ticketing.performance.application.PerformanceHolds;
import org.ticketbox.ticketing.performance.application.PerformanceHolds.HoldView;
import org.ticketbox.ticketing.performance.application.PerformanceHolds.Pick;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock.Scope;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.PurchaseAdmissionHealthInterceptor;

@RestController
@RequestMapping("/api/v2/performances/{performanceId}")
class PerformancePurchaseApi {
    private final PerformanceAvailability availability;
    private final PerformanceHolds holds;
    private final OrderService orders;

    PerformancePurchaseApi(PerformanceAvailability availability, PerformanceHolds holds, OrderService orders) {
        this.availability = availability;
        this.holds = holds;
        this.orders = orders;
    }

    @GetMapping("/availability")
    ResponseEntity<ApiResponse<PerformanceAvailability.Overview>> overview(@PathVariable UUID performanceId) {
        var overview = availability.overview(performanceId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(overview));
    }

    @GetMapping("/availability/sections/{sectionId}")
    ResponseEntity<ApiResponse<PerformanceAvailability.Section>> section(@PathVariable UUID performanceId,
                                                                         @PathVariable UUID sectionId) {
        var section = availability.section(performanceId, sectionId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(section));
    }

    @GetMapping("/hold")
    ResponseEntity<ApiResponse<HoldView>> current(@PathVariable UUID performanceId, Authentication user,
            @RequestHeader("Queue-Access-Token") String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(holds.current(scope(performanceId, user), token)));
    }

    @PutMapping("/hold")
    ApiResponse<HoldView> replace(@PathVariable UUID performanceId, Authentication user,
            @RequestHeader("Queue-Access-Token") String token, @RequestHeader("Idempotency-Key") String key,
            @RequestBody HoldRequest request) {
        return ApiResponse.success(holds.replace(scope(performanceId, user), token, key, request.layoutVersion(),
                request.holdVersion(), request.items()));
    }

    @DeleteMapping("/hold")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void release(@PathVariable UUID performanceId, Authentication user,
                 @RequestHeader("Queue-Access-Token") String token) {
        holds.release(scope(performanceId, user), token);
    }

    @PostMapping("/orders")
    ResponseEntity<ApiResponse<OrderResponse>> checkout(@PathVariable UUID performanceId, Authentication user,
            @RequestHeader("Queue-Access-Token") String token, @RequestHeader("Idempotency-Key") String key,
            @RequestBody CheckoutRequest request, jakarta.servlet.http.HttpServletRequest http) {
        http.setAttribute(PurchaseAdmissionHealthInterceptor.CONCERT, performanceId);
        var order = orders.createPerformanceOrder(performanceId, UUID.fromString(user.getName()),
                request.holdVersion(), key, token);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(order));
    }

    private Scope scope(UUID performanceId, Authentication user) {
        return new Scope(performanceId, UUID.fromString(user.getName()));
    }

    record HoldRequest(Long layoutVersion, long holdVersion, List<Pick> items) {}
    record CheckoutRequest(long holdVersion) {}
}
