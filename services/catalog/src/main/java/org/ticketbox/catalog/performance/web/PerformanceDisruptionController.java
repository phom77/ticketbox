package org.ticketbox.catalog.performance.web;

import java.security.Principal;
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
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.performance.application.PerformanceDisruptions;
import org.ticketbox.catalog.performance.application.PerformanceViews;
import org.ticketbox.catalog.web.ApiResponse;

@RestController
@RequestMapping("/api/admin/v2/performances/{id}/disruption")
public class PerformanceDisruptionController {
    private final PerformanceDisruptions disruptions;

    public PerformanceDisruptionController(PerformanceDisruptions disruptions) {
        this.disruptions = disruptions;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PerformanceDisruptions.Status>> status(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(disruptions.status(id)));
    }

    @GetMapping("/impact")
    public ResponseEntity<ApiResponse<EventDisruptionImpact.Page>> impact(
            @PathVariable UUID id, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(disruptions.impact(id, page, size)));
    }

    @PostMapping
    public ApiResponse<PerformanceDisruptions.Status> confirm(
            @PathVariable UUID id, Principal actor, @RequestBody PerformanceDisruptions.Command command) {
        return ApiResponse.success(disruptions.confirm(id, UUID.fromString(actor.getName()), command));
    }

    @PostMapping("/complete")
    public ApiResponse<PerformanceViews.Publication> complete(@PathVariable UUID id, Principal actor) {
        return ApiResponse.success(disruptions.complete(id, UUID.fromString(actor.getName())));
    }

    @PostMapping("/{actionId}/resume")
    public ApiResponse<PerformanceDisruptions.Status> resume(
            @PathVariable UUID id, @PathVariable UUID actionId, Principal actor) {
        return ApiResponse.success(disruptions.resume(id, actionId, UUID.fromString(actor.getName())));
    }
}
