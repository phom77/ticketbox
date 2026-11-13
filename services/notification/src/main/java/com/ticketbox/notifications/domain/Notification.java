package com.ticketbox.notifications.domain;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

public record Notification(
        UUID messageId,
        UUID userId,
        Channel channel,
        String eventType,
        String subject,
        String body,
        UUID orderId) {
    public enum Channel {
        APP,
        EMAIL
    }

    public static Notification compose(
            NotificationCommand command, Channel channel, String subject, String body) {
        boolean order = command.paymentConfirmed() || command.orderRefunded();
        String type = switch (command.eventType()) {
            case "ticketing.order-refunded" -> "ORDER_REFUNDED";
            case "ticketing.order-confirmed" -> "PAYMENT_SUCCEEDED";
            case "ticketing.event-cancelled" -> "EVENT_CANCELLED";
            case "ticketing.event-postponed" -> "EVENT_POSTPONED";
            default -> "CONCERT_REMINDER";
        };
        String key =
                type
                        + ":"
                        + channel
                        + ":"
                        + (order || command.eventCancelled() || command.eventPostponed()
                                ? command.eventId()
                                : command.aggregateId() + ":" + command.userId());
        return new Notification(
                UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)),
                command.userId(),
                channel,
                type,
                subject,
                body,
                order ? command.aggregateId() : null);
    }
}
