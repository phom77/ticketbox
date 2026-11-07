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

    public static Notification compose(NotificationCommand command, Channel channel) {
        boolean payment = command.paymentConfirmed();
        String type = payment ? "PAYMENT_SUCCEEDED" : "CONCERT_REMINDER";
        String title = command.concertTitle();
        if (title.length() > 350) title = title.substring(0, 350);
        String subject = payment ? "Ve " + title + " da san sang" : "Nhac lich: " + title;
        String body =
                payment
                        ? "Don hang "
                                + command.aggregateId()
                                + " da thanh toan thanh cong. Tong tien: "
                                + command.amount()
                                + " VND. Mo My Tickets de xem ve va QR."
                        : "Concert "
                                + title
                                + " bat dau luc "
                                + command.eventDate()
                                + ". Dia diem: "
                                + command.venueName()
                                + ". Mo My Tickets de xem QR.";
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
