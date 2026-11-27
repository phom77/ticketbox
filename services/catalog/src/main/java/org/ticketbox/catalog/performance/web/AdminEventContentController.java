package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.EventContentService;
import org.ticketbox.catalog.performance.application.EventContentService.ContentState;
import org.ticketbox.catalog.performance.application.EventContentStore.QueueRow;
import org.ticketbox.catalog.performance.application.PerformanceViews.Event;
import org.ticketbox.catalog.performance.domain.EventContentRevision.Action;
import org.ticketbox.catalog.performance.domain.EventContentRevision.State;
import org.ticketbox.catalog.web.ApiResponse;

/** Platform review of event content revisions, and preview of any native event. */
@RestController
@RequestMapping("/api/admin/v2")
public class AdminEventContentController {
    private final EventContentService content;

    public AdminEventContentController(EventContentService content) {
        this.content = content;
    }

    @GetMapping("/event-content-revisions")
    public ResponseEntity<ApiResponse<Page<QueueRow>>> queue(
            @RequestParam(required = false) State state, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return noStore(content.queue(state, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))));
    }

    @GetMapping("/event-content-revisions/{eventId}")
    public ResponseEntity<ApiResponse<ContentState>> review(@PathVariable UUID eventId) {
        return noStore(content.review(eventId));
    }

    @PostMapping("/event-content-revisions/{eventId}/decision")
    public ApiResponse<ContentState> decide(
            @PathVariable UUID eventId, Principal reviewer, @RequestBody Decision request) {
        return ApiResponse.success(content.decide(UUID.fromString(reviewer.getName()), eventId, request.action(),
                request.reason(), request.revision() == null ? -1 : request.revision()));
    }

    @GetMapping("/events/{id}/preview")
    public ResponseEntity<ApiResponse<Event>> preview(
            @PathVariable UUID id, @RequestParam(defaultValue = "false") boolean revision) {
        return noStore(content.preview(null, id, revision));
    }

    private static <T> ResponseEntity<ApiResponse<T>> noStore(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(value));
    }

    record Decision(Action action, String reason, Long revision) {}
}
