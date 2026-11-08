package com.ticketbox.notifications.infrastructure.messaging;

import com.ticketbox.notifications.application.port.NotificationContent;
import com.ticketbox.notifications.domain.NotificationCommand;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class NotificationMessageBundle implements NotificationContent {
    private final MessageSource messages;
    private final Locale locale;

    public NotificationMessageBundle(
            MessageSource messages,
            @Value("${ticketbox.i18n.notification-language:vi}") String language) {
        this.messages = messages;
        this.locale = Locale.forLanguageTag(language);
    }

    @Override
    public Content render(NotificationCommand command) {
        String title = command.concertTitle();
        if (title.length() > 350) title = title.substring(0, 350);

        if (command.paymentConfirmed()) {
            return new Content(
                    text("notification.payment.subject", title),
                    text(
                            "notification.payment.body",
                            command.aggregateId(),
                            command.amount().toString()));
        }
        return new Content(
                text("notification.reminder.subject", title),
                text(
                        "notification.reminder.body",
                        title,
                        command.eventDate(),
                        command.venueName()));
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(key, arguments, locale);
    }
}
