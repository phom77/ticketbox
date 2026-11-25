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
        String venueName,
        String orderReference,
        String otherPartyName,
        String role,
        String note) {
    public static final java.util.List<String> REFUND_REQUEST_TYPES = java.util.List.of(
            "ticketing.refund-request-received", "ticketing.refund-request-approved",
            "ticketing.refund-request-rejected", "ticketing.refund-request-submitted");

    public static final java.util.List<String> TRANSFER_TYPES = java.util.List.of(
            "ticketing.ticket-transfer-offered", "ticketing.ticket-transfer-accepted",
            "ticketing.ticket-transfer-declined", "ticketing.ticket-transfer-cancelled",
            "ticketing.ticket-transfer-expired");

    public NotificationCommand(int schemaVersion, UUID eventId, String eventType, OffsetDateTime occurredAt,
            UUID userId, UUID aggregateId, String correlationId, UUID payloadReference, String concertTitle,
            BigDecimal amount, String eventDate, String venueName, String orderReference) {
        this(schemaVersion, eventId, eventType, occurredAt, userId, aggregateId, correlationId, payloadReference,
                concertTitle, amount, eventDate, venueName, orderReference, null, null, null);
    }

    public NotificationCommand(int schemaVersion, UUID eventId, String eventType, OffsetDateTime occurredAt,
            UUID userId, UUID aggregateId, String correlationId, UUID payloadReference, String concertTitle,
            BigDecimal amount, String eventDate, String venueName, String orderReference, String otherPartyName,
            String role) {
        this(schemaVersion, eventId, eventType, occurredAt, userId, aggregateId, correlationId, payloadReference,
                concertTitle, amount, eventDate, venueName, orderReference, otherPartyName, role, null);
    }

    public NotificationCommand {
        if (schemaVersion != 1) throw new IllegalArgumentException("Unsupported schema version");
        Objects.requireNonNull(eventId);
        Objects.requireNonNull(occurredAt);
        Objects.requireNonNull(userId);
        Objects.requireNonNull(aggregateId);
        if (!"ticketing.order-confirmed".equals(eventType)
                && !"ticketing.order-refunded".equals(eventType)
                && !"ticketing.event-cancelled".equals(eventType)
                && !"ticketing.event-postponed".equals(eventType)
                && !TRANSFER_TYPES.contains(eventType)
                && !REFUND_REQUEST_TYPES.contains(eventType)
                && !"concert.reminder-requested".equals(eventType)) {
            throw new IllegalArgumentException("Unknown event type");
        }
        if (correlationId == null || correlationId.isBlank() || correlationId.length() > 200) {
            throw new IllegalArgumentException("Invalid correlation ID");
        }
        if (!aggregateId.equals(payloadReference))
            throw new IllegalArgumentException("Invalid notification reference");
        if (("ticketing.order-confirmed".equals(eventType) || "ticketing.order-refunded".equals(eventType))
                && (amount == null || amount.signum() < 0)) {
            throw new IllegalArgumentException("Invalid order payload");
        }
        if (TRANSFER_TYPES.contains(eventType)
                && (otherPartyName == null || otherPartyName.isBlank() || otherPartyName.length() > 200
                        || (!"SENDER".equals(role) && !"RECIPIENT".equals(role)))) {
            throw new IllegalArgumentException("Invalid transfer payload");
        }
        if ("ticketing.refund-request-rejected".equals(eventType)
                && (note == null || note.isBlank() || note.length() > 1000)) {
            throw new IllegalArgumentException("Invalid refund request payload");
        }
        if (orderReference != null && !orderReference.matches("DH-[0-9]{8,19}")) {
            throw new IllegalArgumentException("Invalid order reference code");
        }
    }

    public boolean paymentConfirmed() {
        return "ticketing.order-confirmed".equals(eventType);
    }

    public boolean orderRefunded() {
        return "ticketing.order-refunded".equals(eventType);
    }

    public boolean eventCancelled() { return "ticketing.event-cancelled".equals(eventType); }

    public boolean eventPostponed() { return "ticketing.event-postponed".equals(eventType); }

    public boolean refundRequest() { return REFUND_REQUEST_TYPES.contains(eventType); }

    /** The change this refund request command reports: received, approved, rejected or submitted. */
    public String refundRequestChange() { return eventType.substring("ticketing.refund-request-".length()); }

    public boolean ticketTransfer() { return TRANSFER_TYPES.contains(eventType); }

    /** The change this transfer command reports, for example offered or accepted. */
    public String transferChange() { return eventType.substring("ticketing.ticket-transfer-".length()); }
}
