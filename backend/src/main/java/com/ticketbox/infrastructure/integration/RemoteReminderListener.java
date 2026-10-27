package com.ticketbox.infrastructure.integration;

import com.ticketbox.shared.event.RemoteNotificationRequested;
import com.ticketbox.infrastructure.rabbitmq.ConfirmedMessagePublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component @RequiredArgsConstructor
@ConditionalOnProperty(name="ticketbox.notifications.mode",havingValue="remote")
public class RemoteReminderListener {
    private final ConfirmedMessagePublisher publisher;
    @ApplicationModuleListener @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public void on(RemoteNotificationRequested event) {
        publisher.publish("notification.commands.v1",event,event.eventId().toString());
    }
}
