package com.ticketbox.notifications.infrastructure.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.ticketbox.notifications.domain.NotificationCommand;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class NotificationCommands {
    private NotificationCommands() {}

    public static NotificationCommand decode(JsonNode event) {
        if (!event.path("schemaVersion").isInt())
            throw new IllegalArgumentException("Unsupported schema version");
        JsonNode payload = event.path("payload");
        String type = event.path("eventType").asText();
        boolean order = "ticketing.order-confirmed".equals(type) || "ticketing.order-refunded".equals(type);
        return new NotificationCommand(
                event.path("schemaVersion").asInt(),
                UUID.fromString(event.path("eventId").asText()),
                event.path("eventType").asText(),
                OffsetDateTime.parse(event.path("occurredAt").asText()),
                UUID.fromString(event.path("userId").asText()),
                UUID.fromString(event.path("aggregateId").asText()),
                event.path("correlationId").asText(),
                UUID.fromString(payload.path(order ? "orderId" : "concertId").asText()),
                payload.path("concertTitle").asText("TicketBox"),
                payload.path("amount").isNumber() ? payload.path("amount").decimalValue() : null,
                payload.path("eventDate").asText(),
                payload.path("venueName").asText());
    }
}
