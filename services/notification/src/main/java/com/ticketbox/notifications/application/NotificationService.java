package com.ticketbox.notifications.application;

import com.ticketbox.notifications.application.port.NotificationContent;
import com.ticketbox.notifications.application.port.NotificationRepository;
import com.ticketbox.notifications.domain.Notification;
import com.ticketbox.notifications.domain.NotificationCommand;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final NotificationRepository notifications;

    private final NotificationContent content;

    public NotificationService(NotificationRepository notifications, NotificationContent content) {
        this.notifications = notifications;
        this.content = content;
    }

    @Transactional
    public void accept(NotificationCommand command) {
        if (!notifications.recordCommand(command)) return;
        var message = content.render(command);
        for (Notification.Channel channel : Notification.Channel.values()) {
            notifications.save(
                    Notification.compose(command, channel, message.subject(), message.body()));
        }
    }
}
