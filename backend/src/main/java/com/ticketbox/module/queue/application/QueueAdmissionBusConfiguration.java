package com.ticketbox.module.queue.application;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.ChannelTopic;

@Configuration
public class QueueAdmissionBusConfiguration {
    @Bean
    RedisMessageListenerContainer queueAdmissionListener(RedisConnectionFactory factory, QueueAdmissionBus listener) {
        var container=new RedisMessageListenerContainer(); container.setConnectionFactory(factory);
        container.setTaskExecutor(queueHintExecutor());
        container.addMessageListener(listener,new ChannelTopic(QueueAdmissionBus.TOPIC));
        return container;
    }
    @Bean
    org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor queueHintExecutor() {
        var executor=new org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2); executor.setMaxPoolSize(2); executor.setQueueCapacity(2048);
        executor.setThreadNamePrefix("queue-hints-"); executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());
        return executor;
    }
}
