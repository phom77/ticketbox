package com.ticketbox.notifications.application.port;

import java.util.UUID;

public interface NotificationContext {
    String email(UUID userId);

    byte[] document(UUID orderId);
}
