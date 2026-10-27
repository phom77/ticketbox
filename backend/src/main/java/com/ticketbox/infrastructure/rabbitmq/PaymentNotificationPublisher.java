package com.ticketbox.infrastructure.rabbitmq;

import com.ticketbox.shared.event.PaymentCompletedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PaymentNotificationPublisher {
    private final ConfirmedMessagePublisher publisher;
    private final com.ticketbox.module.ticket.OrderPort orders;
    @org.springframework.beans.factory.annotation.Value("${ticketbox.notifications.mode:embedded}")
    private String mode;
    public void publish(PaymentCompletedEvent event) {
        if ("remote".equals(mode)) {
            var order=orders.findNotificationViewByOrderId(event.orderId()).orElseThrow();
            var payload=new java.util.HashMap<String,Object>();
            payload.put("orderId",event.orderId()); payload.put("amount",event.amount());
            payload.put("concertTitle",order.concertTitle()); payload.put("eventDate",order.eventDate());
            payload.put("items",order.items());
            var envelope=new com.ticketbox.shared.event.RemoteNotificationRequested(1,"ticketing.order-confirmed",event.eventId(),
                    event.orderId(),event.userId(),event.occurredAt(),event.eventId().toString(),payload);
            publisher.publish("notification.commands.v1",envelope,event.eventId().toString());
        } else {
            publisher.publish(RabbitMqNames.PAYMENT_SUCCEEDED_ROUTING_KEY,event,event.eventId().toString());
        }
    }
}
