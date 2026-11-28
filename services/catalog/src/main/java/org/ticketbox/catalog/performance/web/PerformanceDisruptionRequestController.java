package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionRequests;
import org.ticketbox.catalog.performance.application.SalesControlStore.QueueItem;
import org.ticketbox.catalog.web.ApiResponse;

/** Platform operations queue of organizer cancel and postpone requests. Accepting is confirming the disruption. */
@RestController
@RequestMapping("/api/admin/v2/performance-disruption-requests")
public class PerformanceDisruptionRequestController {
    private final PerformanceDisruptionRequests requests;

    public PerformanceDisruptionRequestController(PerformanceDisruptionRequests requests) {
        this.requests = requests;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<QueueItem>>> queue(@RequestParam(defaultValue = "REQUESTED") String state) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(requests.queue(state)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<QueueItem>> item(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(requests.item(id)));
    }

    @PostMapping("/{id}/decline")
    public ApiResponse<QueueItem> decline(@PathVariable UUID id, Principal actor, @RequestBody Decline request) {
        return ApiResponse.success(requests.decline(id, UUID.fromString(actor.getName()), request.reason()));
    }

    record Decline(String reason) {}
}
