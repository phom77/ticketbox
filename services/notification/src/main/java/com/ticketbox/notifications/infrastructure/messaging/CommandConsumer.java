package com.ticketbox.notifications.infrastructure.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.notifications.application.NotificationService;

import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.*;
import org.springframework.stereotype.Component;

@Component
public class CommandConsumer {
    private final ObjectMapper json;
    private final NotificationService store;

    public CommandConsumer(ObjectMapper json, NotificationService store) {
        this.json = json;
        this.store = store;
    }

    @RabbitListener(queues = "notification.commands.v1")
    public void receive(Message message) throws Exception {
        if (message.getBody().length > 1048576)
            throw new AmqpRejectAndDontRequeueException("Notification command too large");
        try {
            store.accept(NotificationCommands.decode(json.readTree(message.getBody())));
        } catch (IllegalArgumentException
                | java.time.DateTimeException
                | com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new AmqpRejectAndDontRequeueException("Invalid notification command", exception);
        }
    }
}
