package org.ticketbox.catalog.classification.web;

import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.classification.application.ClassificationQuery;
import org.ticketbox.catalog.web.ApiResponse;

/** The active segments and genres, for pickers and navigation. */
@RestController
@RequestMapping("/api/v2")
public class ClassificationController {
    private final ClassificationQuery classifications;

    public ClassificationController(ClassificationQuery classifications) {
        this.classifications = classifications;
    }

    @GetMapping("/classifications")
    public ResponseEntity<ApiResponse<Classifications>> classifications() {
        var segments = classifications.active().stream().map(segment -> new SegmentView(segment.id(), segment.sort(),
                segment.genres().stream().map(genre -> new GenreView(genre.id(), genre.sort(), genre.popular())).toList()))
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic())
                .body(ApiResponse.success(new Classifications(segments)));
    }

    public record Classifications(List<SegmentView> segments) {}

    public record SegmentView(String id, int sort, List<GenreView> genres) {}

    public record GenreView(String id, int sort, boolean popular) {}
}
