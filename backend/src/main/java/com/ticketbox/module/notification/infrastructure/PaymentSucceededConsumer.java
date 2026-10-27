package com.ticketbox.module.notification.infrastructure;

import com.ticketbox.infrastructure.rabbitmq.RabbitMqNames;
import com.ticketbox.module.notification.application.CreatePaymentNotificationCommand;
import com.ticketbox.module.notification.application.NotificationService;
import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.shared.event.PaymentCompletedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
@RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class PaymentSucceededConsumer {

    private final NotificationService notificationService;
    private final EmailNotificationPublisher emailNotificationPublisher;

    @RabbitListener(
            queues = RabbitMqNames.PAYMENT_SUCCEEDED_QUEUE
    )
    public void consume(PaymentCompletedEvent event) {
        Optional<Notification> emailNotification =
                notificationService.createPaymentSucceededNotification(
                        new CreatePaymentNotificationCommand(
                                event.eventId(),
                                event.userId(),
                                event.orderId(),
                                event.amount(),
                                event.occurredAt()
                        )
                );

        // Publish email to queue only when a new EMAIL notification was created
        emailNotification.ifPresent(n ->
                emailNotificationPublisher.publishEmailNotification(n.getId())
        );
    }
}
