package org.ticketbox.ticketing.infrastructure.integration.notification;

import com.ticketbox.shared.event.RemoteNotificationRequested;

import lombok.RequiredArgsConstructor;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ticketbox.notifications.mode", havingValue = "remote")
public class RemoteReminderListener {
    private final ConfirmedMessagePublisher publisher;

    @ApplicationModuleListener(
            id =
                    "com.ticketbox.infrastructure.integration.RemoteReminderListener.on(com.ticketbox.shared.event.RemoteNotificationRequested)")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void on(RemoteNotificationRequested event) {
        publisher.publish("notification.commands.v1", event, event.eventId().toString());
    }
}
