package com.ticketbox.notifications.web;

import com.ticketbox.notifications.application.NotificationRejection;
import com.ticketbox.notifications.application.port.NotificationQueries;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
public class NotificationApi {
    private final NotificationQueries notifications;

    public NotificationApi(NotificationQueries notifications) {
        this.notifications = notifications;
    }

    static Map<String, Object> response(Object data) {
        return Map.of(
                "code", 200, "message", "Thanh cong", "timestamp", Instant.now(), "data", data);
    }

    @GetMapping("/api/notifications")
    public Object own(
            Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return response(notifications.list(UUID.fromString(auth.getName()), page, size));
    }

    @GetMapping("/api/admin/notifications")
    public Object all(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return response(notifications.list(null, page, size));
    }

    @GetMapping("/api/notifications/unread-count")
    public Object unread(Authentication auth) {
        return response(Map.of("count", notifications.unread(UUID.fromString(auth.getName()))));
    }

    @PatchMapping("/api/notifications/{id}/read")
    public Object read(@PathVariable UUID id, Authentication auth) {
        return response(notifications.markRead(id, UUID.fromString(auth.getName())));
    }

    @PostMapping("/api/admin/notifications/{id}/retry")
    public Object retry(@PathVariable UUID id, Authentication auth) {
        return response(notifications.retry(id, UUID.fromString(auth.getName())));
    }

    @RestControllerAdvice
    static class Errors {
        @ExceptionHandler(NotificationRejection.class)
        ResponseEntity<?> rejected(NotificationRejection error) {
            int status =
                    switch (error.kind()) {
                        case INVALID_PAGE -> 400;
                        case MISSING_NOTIFICATION -> 404;
                        case NOT_RETRYABLE -> 409;
                    };
            return ResponseEntity.status(status)
                    .body(
                            Map.of(
                                    "code",
                                    status,
                                    "message",
                                    error.getMessage(),
                                    "timestamp",
                                    Instant.now()));
        }
    }
}
