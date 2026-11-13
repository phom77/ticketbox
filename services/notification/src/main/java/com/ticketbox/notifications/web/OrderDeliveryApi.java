package com.ticketbox.notifications.web;

import com.ticketbox.notifications.application.port.NotificationQueries;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@RestController
class OrderDeliveryApi {
    private final NotificationQueries notifications;
    private final byte[] token;

    OrderDeliveryApi(NotificationQueries notifications, @Value("${notification.identity-token:}") String token) {
        this.notifications = notifications;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/internal/notifications/order-delivery/{id}")
    ResponseEntity<?> delivery(@PathVariable UUID id,
            @RequestHeader(value = "X-Service-Token", required = false) String provided) {
        authenticate(provided);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(notifications.orderEmailStatus(id));
    }

    @GetMapping("/internal/notifications/support/failures")
    ResponseEntity<?> failed(@RequestParam int page, @RequestParam int size,
            @RequestHeader(value = "X-Service-Token", required = false) String provided) {
        authenticate(provided);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(notifications.failedOrderEmails(page, size));
    }

    private void authenticate(String provided) {
        if (token.length < 32 || provided == null || !MessageDigest.isEqual(token, provided.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
