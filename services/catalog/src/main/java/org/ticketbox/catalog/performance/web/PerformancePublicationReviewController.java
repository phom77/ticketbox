package org.ticketbox.catalog.performance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview.Action;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Review;
import org.ticketbox.catalog.web.ApiResponse;

@RestController
@RequestMapping("/api/admin/v2/performance-reviews")
public class PerformancePublicationReviewController {
    private final PerformancePublicationReview reviews;

    public PerformancePublicationReviewController(PerformancePublicationReview reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    ResponseEntity<ApiResponse<List<Review>>> queue() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(reviews.queue()));
    }

    @GetMapping("/{id}")
    ResponseEntity<ApiResponse<Review>> review(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(reviews.current(id)));
    }

    @PostMapping("/{id}")
    ApiResponse<Review> decide(@PathVariable UUID id, Principal actor, @Valid @RequestBody Decision request) {
        return ApiResponse.success(reviews.decide(id, request.revision(), UUID.fromString(actor.getName()),
                request.action(), request.reason()));
    }

    record Decision(@NotNull UUID revision, @NotNull Action action, String reason) {}
}
