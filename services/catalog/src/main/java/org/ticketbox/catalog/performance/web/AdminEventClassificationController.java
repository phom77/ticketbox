package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.EventContentService;
import org.ticketbox.catalog.performance.application.PerformanceViews.Event;
import org.ticketbox.catalog.web.ApiResponse;

/** Platform correction of an event's classification, for native and legacy-linked events. */
@RestController
@RequestMapping("/api/admin/events")
public class AdminEventClassificationController {
    private final EventContentService content;

    public AdminEventClassificationController(EventContentService content) {
        this.content = content;
    }

    @PutMapping("/{id}/classification")
    public ApiResponse<Event> correct(
            @PathVariable UUID id, Principal admin, @RequestBody ClassificationRequest request) {
        return ApiResponse.success(content.correctClassification(UUID.fromString(admin.getName()), id,
                request.expectedContentVersion(), request.segment(), request.primaryGenre(), request.genres()));
    }

    record ClassificationRequest(String segment, String primaryGenre, List<String> genres,
                                 Long expectedContentVersion) {}
}
