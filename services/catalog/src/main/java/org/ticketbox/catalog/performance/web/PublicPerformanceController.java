package org.ticketbox.catalog.performance.web;

import java.time.Duration;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.web.ApiResponse;

@RestController
@RequestMapping("/api/v2")
public class PublicPerformanceController {
    private static final CacheControl LAYOUT_CACHE = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();
    private final PerformanceCatalog catalog;

    public PublicPerformanceController(PerformanceCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/events")
    public ApiResponse<Page<Event>> events(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.success(catalog.events(null, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))));
    }

    @GetMapping("/events/{id}")
    public ApiResponse<Event> event(@PathVariable UUID id) {
        return ApiResponse.success(catalog.event(id, null));
    }

    @GetMapping("/performances/{id}/layout")
    public ResponseEntity<ApiResponse<LayoutOverview>> overview(@PathVariable UUID id) {
        var result = catalog.layoutOverview(id);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE).eTag("\"layout-" + id + "-" + result.version() + "\"")
                .body(ApiResponse.success(result));
    }

    @GetMapping("/performances/{id}/layout/sections/{section}")
    public ResponseEntity<ApiResponse<LayoutSection>> section(@PathVariable UUID id, @PathVariable UUID section) {
        var result = catalog.layoutSection(id, section);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE)
                .eTag("\"layout-" + id + "-" + result.version() + "-" + section + "\"")
                .body(ApiResponse.success(result));
    }

    @GetMapping("/performances/{id}/layout/background/{asset}")
    public ResponseEntity<byte[]> background(
            @PathVariable UUID id, @PathVariable UUID asset, @RequestParam long version) {
        var image = catalog.publishedBackground(id, version, asset);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE)
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }
}
