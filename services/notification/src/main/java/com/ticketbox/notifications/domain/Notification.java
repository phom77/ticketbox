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
        boolean payment = command.paymentConfirmed();
        String type = payment ? "PAYMENT_SUCCEEDED" : "CONCERT_REMINDER";
        String key =
                type
                        + ":"
                        + channel
                        + ":"
                        + (payment
                                ? command.eventId()
                                : command.aggregateId() + ":" + command.userId());
        return new Notification(
                UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)),
                command.userId(),
                channel,
                type,
                subject,
                body,
                payment ? command.aggregateId() : null);
    }
}
