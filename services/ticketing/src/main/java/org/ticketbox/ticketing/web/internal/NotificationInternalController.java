package org.ticketbox.ticketing.web.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.issuance.application.port.ETicketDocumentPort;
import org.ticketbox.ticketing.order.application.port.OrderPort;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@RestController
@RequestMapping("/internal/notifications")
@ConditionalOnProperty(name = "ticketbox.notifications.mode", havingValue = "remote")
public class NotificationInternalController {
    private final UserContactPort users;
    private final OrderPort orders;
    private final ETicketDocumentPort documents;
    private final byte[] token;

    public NotificationInternalController(
            UserContactPort users,
            OrderPort orders,
            ETicketDocumentPort documents,
            @Value("${ticketbox.notifications.service-token:}") String token) {
        if (token.length() < 32)
            throw new IllegalStateException(
                    "Notification service token must be at least 32 characters");
        this.users = users;
        this.orders = orders;
        this.documents = documents;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    private void authorize(String supplied) {
        if (supplied == null
                || !MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    @GetMapping("/users/{id}")
    public Object contact(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Service-Token", required = false) String supplied) {
        authorize(supplied);
        return users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/orders/{id}")
    public Object order(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Service-Token", required = false) String supplied) {
        authorize(supplied);
        return orders.findNotificationViewByOrderId(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/orders/{id}/document")
    public ResponseEntity<byte[]> document(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Service-Token", required = false) String supplied) {
        authorize(supplied);
        var doc =
                documents
                        .createForOrder(id)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(doc.contentType()))
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(doc.filename()).build().toString())
                .body(doc.content());
    }
}
