package com.ticketbox.notifications.application;

import com.ticketbox.notifications.application.port.NotificationMail;
import com.ticketbox.notifications.application.port.NotificationContent;
import com.ticketbox.notifications.application.port.PasswordResetMailSource;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Set;

@Component
public class PasswordResetDelivery {
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger(PasswordResetDelivery.class);
    private final PasswordResetMailSource source;
    private final NotificationMail mail;
    private final NotificationContent content;
    private final URI origin;

    PasswordResetDelivery(PasswordResetMailSource source, NotificationMail mail, NotificationContent content,
            @Value("${notification.password-reset-web-origin:}") String origin) {
        this.source = source;
        this.mail = mail;
        this.content = content;
        this.origin = origin.isBlank() ? null : URI.create(origin);
        if (this.origin != null && !allowed(this.origin)) throw new IllegalArgumentException("Invalid password reset web origin");
    }

    public void deliver() {
        if (origin == null) return;
        try {
            var candidate = source.claim();
            if (candidate.isEmpty()) return;
            var message = candidate.orElseThrow();
            boolean delivered = false;
            try {
                String link = origin.resolve("/reset-password#token=" + message.token()).toString();
                var rendered = content.renderPasswordReset(link);
                mail.sendPlain(message.email(), rendered.subject(), rendered.body());
                delivered = true;
            } catch (Exception failure) {
                LOG.warn("Password recovery delivery retained for retry: {}", failure.getClass().getSimpleName());
            }
            source.finish(message.id(), message.leaseId(), delivered);
        } catch (RuntimeException failure) {
            LOG.warn("Password recovery queue unavailable: {}", failure.getClass().getSimpleName());
        }
    }

    private static boolean allowed(URI origin) {
        String host = origin.getHost();
        return host != null && origin.getUserInfo() == null && origin.getQuery() == null && origin.getFragment() == null
                && Set.of("", "/").contains(origin.getPath())
                && ("https".equalsIgnoreCase(origin.getScheme()) || ("http".equalsIgnoreCase(origin.getScheme())
                && Set.of("localhost", "127.0.0.1", "[::1]").contains(host)));
    }
}
