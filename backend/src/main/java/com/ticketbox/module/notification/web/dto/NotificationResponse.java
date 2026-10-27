package com.ticketbox.module.notification.web.dto;

import com.ticketbox.module.notification.domain.Notification;

import java.time.OffsetDateTime;
import java.util.UUID;

public record NotificationResponse(
        UUID id,
        Notification.Channel channel,
        String eventType,
        String subject,
        String body,
        Notification.Status status,
        OffsetDateTime sentAt,
        OffsetDateTime readAt,
        boolean read,
        OffsetDateTime createdAt
) {
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getChannel(),
                notification.getEventType(),
                notification.getSubject(),
                notification.getBody(),
                notification.getStatus(),
                notification.getSentAt(),
                notification.getReadAt(),
                notification.getReadAt() != null,
                notification.getCreatedAt()
        );
    }
}
