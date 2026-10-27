package com.ticketbox.notifications;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.*;
import org.springframework.stereotype.Component;

@Component
public class CommandConsumer {
 private final ObjectMapper json;private final NotificationStore store;
 public CommandConsumer(ObjectMapper json,NotificationStore store){this.json=json;this.store=store;}
 @RabbitListener(queues="notification.commands.v1")
 public void receive(Message message) throws Exception {
  if(message.getBody().length>1048576) throw new AmqpRejectAndDontRequeueException("Notification command too large");
  try { store.accept(json.readTree(message.getBody())); }
  catch(IllegalArgumentException | java.time.DateTimeException | com.fasterxml.jackson.core.JsonProcessingException exception) {
   throw new AmqpRejectAndDontRequeueException("Invalid notification command",exception);
  }
 }
 @Configuration static class Queues {
  @Bean TopicExchange events(){return new TopicExchange("ticketbox.events",true,false);}
  @Bean DirectExchange deadLetters(){return new DirectExchange("ticketbox.dlx",true,false);}
  @Bean Queue commands(){return QueueBuilder.durable("notification.commands.v1").deadLetterExchange("ticketbox.dlx").deadLetterRoutingKey("notification.commands.v1.dlq").build();}
  @Bean Queue rejected(){return QueueBuilder.durable("notification.commands.v1.dlq").build();}
  @Bean Binding commandBinding(Queue commands,TopicExchange events){return BindingBuilder.bind(commands).to(events).with("notification.commands.v1");}
  @Bean Binding deadBinding(Queue rejected,DirectExchange deadLetters){return BindingBuilder.bind(rejected).to(deadLetters).with("notification.commands.v1.dlq");}
 }
}
