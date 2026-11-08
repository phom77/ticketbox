package com.ticketbox.notifications.application.port;

import com.ticketbox.notifications.domain.NotificationCommand;

public interface NotificationContent {
    Content render(NotificationCommand command);

    record Content(String subject, String body) {}
}
