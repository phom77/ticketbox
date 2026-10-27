package com.ticketbox.infrastructure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class BoundedAsyncConfiguration {
    // Multiple named job executors disable Boot's default task executor auto-configuration.
    // Define the name Spring @Async actually resolves; properties alone do not bound it.
    @Bean(name={"taskExecutor","applicationTaskExecutor"})
    public ThreadPoolTaskExecutor taskExecutor() {
        var executor=new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4); executor.setMaxPoolSize(8); executor.setQueueCapacity(256);
        executor.setThreadNamePrefix("domain-events-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        return executor;
    }
}
