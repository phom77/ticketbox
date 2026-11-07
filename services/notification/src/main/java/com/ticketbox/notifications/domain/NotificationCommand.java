package com.ticketbox.notifications.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record NotificationCommand(
        int schemaVersion,
        UUID eventId,
        String eventType,
        OffsetDateTime occurredAt,
        UUID userId,
        UUID aggregateId,
        String correlationId,
        UUID payloadReference,
        String concertTitle,
        BigDecimal amount,
        String eventDate,
        String venueName) {
    public NotificationCommand {
        if (schemaVersion != 1) throw new IllegalArgumentException("Unsupported schema version");
        Objects.requireNonNull(eventId);
        Objects.requireNonNull(occurredAt);
        Objects.requireNonNull(userId);
        Objects.requireNonNull(aggregateId);
        if (!"ticketing.order-confirmed".equals(eventType)
                && !"concert.reminder-requested".equals(eventType)) {
            throw new IllegalArgumentException("Unknown event type");
        }
        if (correlationId == null || correlationId.isBlank() || correlationId.length() > 200) {
            throw new IllegalArgumentException("Invalid correlation ID");
        }
        if (!aggregateId.equals(payloadReference))
            throw new IllegalArgumentException("Invalid notification reference");
        if ("ticketing.order-confirmed".equals(eventType)
                && (amount == null || amount.signum() < 0)) {
            throw new IllegalArgumentException("Invalid order payload");
        }
    }

    public boolean paymentConfirmed() {
        return "ticketing.order-confirmed".equals(eventType);
    }
}
