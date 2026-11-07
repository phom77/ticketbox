package com.ticketbox.notifications.application;

import com.ticketbox.notifications.application.port.NotificationContext;
import com.ticketbox.notifications.application.port.NotificationMail;
import com.ticketbox.notifications.application.port.NotificationRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class DeliveryWorker {
    private static final Logger log = LoggerFactory.getLogger(DeliveryWorker.class);
    private final NotificationRepository store;
    private final NotificationContext core;
    private final NotificationMail smtp;

    public DeliveryWorker(
            NotificationRepository store, NotificationContext core, NotificationMail smtp) {
        this.store = store;
        this.core = core;
        this.smtp = smtp;
    }

    public void deliver() {
        for (int i = 0; i < 10; i++) {
            var delivery = store.claim();
            if (delivery == null) return;
            try {
                String email = core.email(delivery.user());
                if (email.isBlank()) throw new IllegalStateException("Contact email unavailable");
                byte[] document = delivery.order() == null ? null : core.document(delivery.order());
                if (!store.renew(delivery)) continue;
                smtp.send(delivery, email, document);
                store.sent(delivery);
            } catch (Exception failure) {
                // No DB transaction is held while calling Core or SMTP. Delivery remains observable
                // after failure.
                store.failed(delivery, failure.getClass().getSimpleName());
                log.warn(
                        "Delivery {} retained/failed: {}",
                        delivery.id(),
                        failure.getClass().getSimpleName());
            }
        }
    }
}
