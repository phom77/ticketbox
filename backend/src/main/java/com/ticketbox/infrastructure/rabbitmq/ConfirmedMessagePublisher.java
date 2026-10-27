package com.ticketbox.infrastructure.rabbitmq;

import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;
import java.util.concurrent.TimeUnit;

@Component @RequiredArgsConstructor
public class ConfirmedMessagePublisher {
    private final RabbitTemplate rabbit;
    public void publish(String routingKey, Object event, String messageId) {
        var correlation=new CorrelationData(messageId);
        rabbit.convertAndSend(RabbitMqNames.EVENTS_EXCHANGE,routingKey,event,message -> {
            message.getMessageProperties().setMessageId(messageId); return message;
        },correlation);
        try {
            var confirm=correlation.getFuture().get(5,TimeUnit.SECONDS);
            if (!confirm.isAck() || correlation.getReturned()!=null) throw new IllegalStateException("Broker did not durably route message");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Broker confirmation interrupted",exception);
        } catch (Exception exception) { throw new IllegalStateException("Broker confirmation unavailable",exception); }
    }
}
