package com.ticketbox.notifications.application.port;

import java.util.Map;
import java.util.UUID;

public interface NotificationQueries {
    Map<String, Object> list(UUID userId, int page, int size);

    long unread(UUID userId);

    Map<String, Object> markRead(UUID notificationId, UUID userId);

    Map<String, Object> retry(UUID notificationId, UUID actorId, UUID actionId);

    java.util.List<Map<String, Object>> orderEmailStatus(UUID orderId);

    Map<String, Object> failedOrderEmails(int page, int size);
}
