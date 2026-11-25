package com.ticketbox.notifications.infrastructure.messaging;

import com.ticketbox.notifications.application.port.NotificationContent;
import com.ticketbox.notifications.domain.NotificationCommand;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Component
public class NotificationMessageBundle implements NotificationContent {
    private static final List<Locale> LEGACY_LOCALES = List.of(Locale.ENGLISH, Locale.forLanguageTag("vi"));
    private static final String AMOUNT_MARKER = "{amount}";

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
            return new Content(text("notification.payment.subject", title),
                    orderBody("notification.payment.body", command));
        }
        if (command.orderRefunded()) {
            return new Content(text("notification.refund.subject"),
                    orderBody("notification.refund.body", command));
        }
        if (command.ticketTransfer()) {
            String key = "notification.transfer." + command.transferChange() + "."
                    + command.role().toLowerCase(java.util.Locale.ROOT);
            return new Content(text(key + ".subject", title, command.otherPartyName()),
                    text(key + ".body", title, command.otherPartyName()));
        }
        if (command.eventCancelled()) return new Content(text("notification.cancel.subject", title),
                text("notification.cancel.body", title));
        if (command.eventPostponed()) return new Content(text("notification.postpone.subject", title),
                text("notification.postpone.body", title, command.eventDate()));
        return new Content(
                text("notification.reminder.subject", title),
                text(
                        "notification.reminder.body",
                        title,
                        command.eventDate(),
                        command.venueName()));
    }

    private String orderBody(String key, NotificationCommand command) {
        String amount = command.amount().toString();
        return command.orderReference() == null
                ? text(key + "-without-reference", amount)
                : text(key, command.orderReference(), amount);
    }

    public String visibleBody(String type, UUID reference, String body) {
        if (reference == null || body == null || !body.contains(reference.toString())) return body;
        String key = switch (type) {
            case "PAYMENT_SUCCEEDED" -> "notification.payment.body";
            case "ORDER_REFUNDED" -> "notification.refund.body";
            default -> null;
        };
        if (key == null) return body;
        // Match the original template and keep its language and amount. Stored bodies remain available for audit.
        for (Locale language : LEGACY_LOCALES) {
            String pattern = messages.getMessage(key, new Object[] { reference, AMOUNT_MARKER }, language);
            int marker = pattern.indexOf(AMOUNT_MARKER);
            String prefix = pattern.substring(0, marker);
            String suffix = pattern.substring(marker + AMOUNT_MARKER.length());
            if (body.length() > prefix.length() + suffix.length() && body.startsWith(prefix) && body.endsWith(suffix)) {
                String amount = body.substring(prefix.length(), body.length() - suffix.length());
                if (amount.matches("[0-9]+(\\.[0-9]+)?(E[+-]?[0-9]+)?")) {
                    return messages.getMessage(key + "-without-reference", new Object[] { amount }, language);
                }
            }
        }
        return body;
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(key, arguments, locale);
    }

    @Override
    public Content renderPasswordReset(String link) {
        return new Content(text("notification.password-reset.subject"), text("notification.password-reset.body", link));
    }

    public Content renderOrganizerLink(String link) {
        return new Content(text("notification.organizer-link.subject"), text("notification.organizer-link.body", link));
    }
}
