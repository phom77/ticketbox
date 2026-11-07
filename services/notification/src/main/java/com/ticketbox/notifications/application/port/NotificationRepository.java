package com.ticketbox.notifications.application.port;

import com.ticketbox.notifications.domain.Notification;
import com.ticketbox.notifications.domain.NotificationCommand;

import java.util.UUID;

public interface NotificationRepository {
    boolean recordCommand(NotificationCommand command);

    void save(Notification notification);

    Delivery claim();

    boolean renew(Delivery delivery);

    void sent(Delivery delivery);

    void failed(Delivery delivery, String error);

    record Delivery(UUID id, UUID user, UUID order, String subject, String body, UUID owner) {}
}
