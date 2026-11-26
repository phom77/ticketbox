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
            case "ticketing.ticket-transfer-offered" -> "TICKET_TRANSFER_OFFERED";
            case "ticketing.ticket-transfer-accepted" -> "TICKET_TRANSFER_ACCEPTED";
            case "ticketing.ticket-transfer-declined" -> "TICKET_TRANSFER_DECLINED";
            case "ticketing.ticket-transfer-cancelled" -> "TICKET_TRANSFER_CANCELLED";
            case "ticketing.ticket-transfer-expired" -> "TICKET_TRANSFER_EXPIRED";
            case "ticketing.refund-request-received" -> "REFUND_REQUEST_RECEIVED";
            case "ticketing.refund-request-approved" -> "REFUND_REQUEST_APPROVED";
            case "ticketing.refund-request-rejected" -> "REFUND_REQUEST_REJECTED";
            case "ticketing.refund-request-submitted" -> "REFUND_REQUEST_SUBMITTED";
            default -> "CONCERT_REMINDER";
        };
        String key =
                type
                        + ":"
                        + channel
                        + ":"
                        + (order || command.eventCancelled() || command.eventPostponed() || command.ticketTransfer()
                                || command.refundRequest()
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
