package com.ticketbox.notifications.application.port;

import com.ticketbox.notifications.domain.NotificationCommand;

public interface NotificationContent {
    Content render(NotificationCommand command);

    Content renderPasswordReset(String link);

    record Content(String subject, String body) {}
}
