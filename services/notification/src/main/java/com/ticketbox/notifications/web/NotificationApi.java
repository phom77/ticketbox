package com.ticketbox.notifications.web;

import com.ticketbox.notifications.application.NotificationRejection;
import com.ticketbox.notifications.application.port.NotificationQueries;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
public class NotificationApi {
    private final NotificationQueries notifications;

    private final ApiMessages messages;

    public NotificationApi(NotificationQueries notifications, ApiMessages messages) {
        this.notifications = notifications;
        this.messages = messages;
    }

    private Map<String, Object> response(Object data, Locale locale, HttpServletResponse response) {
        return Map.of(
                "code",
                200,
                "message",
                messages.responseText("response.success", locale, response),
                "timestamp",
                Instant.now(),
                "data",
                data);
    }

    @GetMapping("/api/notifications")
    public Object own(
            Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Locale locale,
            HttpServletResponse response) {
        return response(
                notifications.list(UUID.fromString(auth.getName()), page, size), locale, response);
    }

    @GetMapping("/api/admin/notifications")
    public Object all(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Locale locale,
            HttpServletResponse response) {
        return response(notifications.list(null, page, size), locale, response);
    }

    @GetMapping("/api/notifications/unread-count")
    public Object unread(Authentication auth, Locale locale, HttpServletResponse response) {
        return response(
                Map.of("count", notifications.unread(UUID.fromString(auth.getName()))),
                locale,
                response);
    }

    @PatchMapping("/api/notifications/{id}/read")
    public Object read(
            @PathVariable UUID id,
            Authentication auth,
            Locale locale,
            HttpServletResponse response) {
        return response(
                notifications.markRead(id, UUID.fromString(auth.getName())), locale, response);
    }

    @PostMapping("/api/admin/notifications/{id}/retry")
    public Object retry(
            @PathVariable UUID id,
            Authentication auth,
            Locale locale,
            HttpServletResponse response) {
        return response(notifications.retry(id, UUID.fromString(auth.getName())), locale, response);
    }

    @RestControllerAdvice
    static class Errors {
        private final ApiMessages messages;

        Errors(ApiMessages messages) {
            this.messages = messages;
        }

        @ExceptionHandler(NotificationRejection.class)
        ResponseEntity<?> rejected(
                NotificationRejection error, Locale locale, HttpServletResponse response) {
            int status =
                    switch (error.kind()) {
                        case INVALID_PAGE -> 400;
                        case MISSING_NOTIFICATION -> 404;
                        case NOT_RETRYABLE -> 409;
                    };
            String key =
                    switch (error.kind()) {
                        case INVALID_PAGE -> "error.notification.invalid-page";
                        case MISSING_NOTIFICATION -> "error.notification.not-found";
                        case NOT_RETRYABLE -> "error.notification.not-retryable";
                    };
            return ResponseEntity.status(status)
                    .body(
                            Map.of(
                                    "code",
                                    status,
                                    "message",
                                    messages.responseText(key, locale, response),
                                    "timestamp",
                                    Instant.now()));
        }
    }
}
