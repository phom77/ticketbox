package org.ticketbox.catalog.concert.web;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.catalog.concert.application.EventDisruptionService;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.web.ApiResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/concerts/{concert}/disruption")
class EventDisruptionController {
    private final EventDisruptionService disruptions;

    EventDisruptionController(EventDisruptionService disruptions) { this.disruptions = disruptions; }

    @GetMapping
    ResponseEntity<ApiResponse<EventDisruptionService.Status>> status(@PathVariable UUID concert) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(disruptions.status(concert)));
    }

    @GetMapping("/impact")
    ResponseEntity<ApiResponse<EventDisruptionImpact.Page>> impact(@PathVariable UUID concert,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(disruptions.impact(concert, page, size)));
    }

    @PostMapping
    ApiResponse<EventDisruptionService.Status> confirm(@PathVariable UUID concert, Authentication auth,
            @RequestBody EventDisruptionService.Command command) {
        return ApiResponse.success(disruptions.confirm(concert, UUID.fromString(auth.getName()), command));
    }

    @PostMapping("/{operation}/resume")
    ApiResponse<EventDisruptionService.Status> resume(@PathVariable UUID concert, @PathVariable UUID operation, Authentication auth) {
        return ApiResponse.success(disruptions.resume(concert, operation, UUID.fromString(auth.getName())));
    }
}
