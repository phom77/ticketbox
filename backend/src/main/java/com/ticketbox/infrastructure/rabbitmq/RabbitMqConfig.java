package com.ticketbox.infrastructure.rabbitmq;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMqConfig {
    @Bean
    Queue remoteNotificationCommands() {
        return QueueBuilder.durable("notification.commands.v1")
            .deadLetterExchange(RabbitMqNames.DEAD_LETTER_EXCHANGE)
            .deadLetterRoutingKey("notification.commands.v1.dlq").build();
    }
    @Bean
    Queue remoteNotificationDeadLetters() { return QueueBuilder.durable("notification.commands.v1.dlq").build(); }
    @Bean
    Binding remoteCommandsBinding() {
        return BindingBuilder.bind(remoteNotificationCommands()).to(ticketboxEventsExchange()).with("notification.commands.v1");
    }
    @Bean
    Binding remoteDeadLettersBinding() {
        return BindingBuilder.bind(remoteNotificationDeadLetters()).to(ticketboxDeadLetterExchange()).with("notification.commands.v1.dlq");
    }
    @Bean
    TopicExchange ticketboxEventsExchange() {
        return new TopicExchange(
                RabbitMqNames.EVENTS_EXCHANGE,
                true,
                false
        );
    }

    @Bean
    DirectExchange ticketboxDeadLetterExchange() {
        return new DirectExchange(
                RabbitMqNames.DEAD_LETTER_EXCHANGE,
                true,
                false
        );
    }

    @Bean
    Queue paymentSucceededQueue() {
        return QueueBuilder
                .durable(RabbitMqNames.PAYMENT_SUCCEEDED_QUEUE)
                .deadLetterExchange(
                        RabbitMqNames.DEAD_LETTER_EXCHANGE
                )
                .deadLetterRoutingKey(
                        RabbitMqNames
                                .PAYMENT_SUCCEEDED_DLQ_ROUTING_KEY
                )
                .build();
    }

    @Bean
    Queue paymentSucceededDeadLetterQueue() {
        return QueueBuilder
                .durable(RabbitMqNames.PAYMENT_SUCCEEDED_DLQ)
                .build();
    }

    @Bean
    Binding paymentSucceededBinding(
            Queue paymentSucceededQueue,
            TopicExchange ticketboxEventsExchange
    ) {
        return BindingBuilder
                .bind(paymentSucceededQueue)
                .to(ticketboxEventsExchange)
                .with(
                        RabbitMqNames.PAYMENT_SUCCEEDED_ROUTING_KEY
                );
    }

    @Bean
    Binding paymentSucceededDeadLetterBinding(
            Queue paymentSucceededDeadLetterQueue,
            DirectExchange ticketboxDeadLetterExchange
    ) {
        return BindingBuilder
                .bind(paymentSucceededDeadLetterQueue)
                .to(ticketboxDeadLetterExchange)
                .with(
                        RabbitMqNames
                                .PAYMENT_SUCCEEDED_DLQ_ROUTING_KEY
                );
    }

    @Bean
    MessageConverter rabbitMessageConverter(
            ObjectMapper objectMapper
    ) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    Queue notificationEmailQueue() {
        return QueueBuilder
                .durable(RabbitMqNames.NOTIFICATION_EMAIL_QUEUE)
                .deadLetterExchange(
                        RabbitMqNames.DEAD_LETTER_EXCHANGE
                )
                .deadLetterRoutingKey(
                        RabbitMqNames.NOTIFICATION_EMAIL_DLQ_ROUTING_KEY
                )
                .build();
    }

    @Bean
    Queue notificationEmailDeadLetterQueue() {
        return QueueBuilder
                .durable(RabbitMqNames.NOTIFICATION_EMAIL_DLQ)
                .build();
    }

    @Bean
    Binding notificationEmailBinding(
            Queue notificationEmailQueue,
            TopicExchange ticketboxEventsExchange
    ) {
        return BindingBuilder
                .bind(notificationEmailQueue)
                .to(ticketboxEventsExchange)
                .with(RabbitMqNames.NOTIFICATION_EMAIL_ROUTING_KEY);
    }

    @Bean
    Binding notificationEmailDeadLetterBinding(
            Queue notificationEmailDeadLetterQueue,
            DirectExchange ticketboxDeadLetterExchange
    ) {
        return BindingBuilder
                .bind(notificationEmailDeadLetterQueue)
                .to(ticketboxDeadLetterExchange)
                .with(RabbitMqNames.NOTIFICATION_EMAIL_DLQ_ROUTING_KEY);
    }
}
