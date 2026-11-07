package com.ticketbox.notifications.config;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.*;

@Configuration
public class NotificationQueues {
    @Bean
    TopicExchange events() {
        return new TopicExchange("ticketbox.events", true, false);
    }

    @Bean
    DirectExchange deadLetters() {
        return new DirectExchange("ticketbox.dlx", true, false);
    }

    @Bean
    Queue commands() {
        return QueueBuilder.durable("notification.commands.v1")
                .deadLetterExchange("ticketbox.dlx")
                .deadLetterRoutingKey("notification.commands.v1.dlq")
                .build();
    }

    @Bean
    Queue rejected() {
        return QueueBuilder.durable("notification.commands.v1.dlq").build();
    }

    @Bean
    Binding commandBinding(Queue commands, TopicExchange events) {
        return BindingBuilder.bind(commands).to(events).with("notification.commands.v1");
    }

    @Bean
    Binding deadBinding(Queue rejected, DirectExchange deadLetters) {
        return BindingBuilder.bind(rejected).to(deadLetters).with("notification.commands.v1.dlq");
    }
}
