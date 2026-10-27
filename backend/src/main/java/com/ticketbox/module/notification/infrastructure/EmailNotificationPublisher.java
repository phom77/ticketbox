package com.ticketbox.module.notification.infrastructure;

import com.ticketbox.infrastructure.rabbitmq.EmailNotificationMessage;
import com.ticketbox.infrastructure.rabbitmq.RabbitMqNames;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Publishes an {@link EmailNotificationMessage} to the {@code notification.email} queue.
 *
 * <p>Uses the message ID (= notificationId) as the AMQP messageId property
 * so consumers can identify at-least-once deliveries.
 */
@Component
@RequiredArgsConstructor
public class EmailNotificationPublisher {

    private final com.ticketbox.infrastructure.rabbitmq.ConfirmedMessagePublisher publisher;
    public void publishEmailNotification(UUID notificationId) {
        publisher.publish(RabbitMqNames.NOTIFICATION_EMAIL_ROUTING_KEY,new EmailNotificationMessage(notificationId),notificationId.toString());
    }
}
