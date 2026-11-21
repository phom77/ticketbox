package org.ticketbox.catalog.performance.web;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformanceViews.OperationsPerformance;
import org.ticketbox.catalog.web.ApiResponse;

@RestController
@RequestMapping("/api/admin/v2/performances")
public class PerformanceOperationsController {
    private final PerformanceCatalog catalog;

    public PerformanceOperationsController(PerformanceCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<OperationsPerformance>>> performances(
            @RequestParam(defaultValue = "") String query, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        String term = query.strip();
        if (term.length() > 200 || page < 0 || size < 1 || size > 100) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-operations-search");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(catalog.operationsPerformances(term, PageRequest.of(page, size))));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OperationsPerformance>> performance(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(catalog.operationsPerformance(id)));
    }
}
