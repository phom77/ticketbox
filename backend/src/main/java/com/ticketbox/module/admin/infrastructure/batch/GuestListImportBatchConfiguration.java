package com.ticketbox.module.admin.infrastructure.batch;

import java.util.concurrent.Executor;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
@EnableConfigurationProperties(GuestListImportProperties.class)
public class GuestListImportBatchConfiguration {

    @Bean
    Job guestListImportJob(
            JobRepository jobRepository,
            Step guestListImportStep,
            GuestListImportJobListener listener) {
        return new JobBuilder("GUEST_LIST_IMPORT", jobRepository)
                .start(guestListImportStep)
                .listener(listener)
                .build();
    }

    @Bean
    Step guestListImportStep(
            JobRepository jobRepository,
            PlatformTransactionManager transactionManager,
            GuestListImportTasklet tasklet) {
        return new StepBuilder("stageValidateAndMergeGuestList", jobRepository)
                .tasklet(tasklet, transactionManager)
                .build();
    }

    @Bean(name = "guestListImportExecutor")
    Executor guestListImportExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("guest-list-import-");
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(20);
        executor.initialize();
        return executor;
    }

    @Bean
    LockProvider lockProvider(JdbcTemplate jdbcTemplate) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(jdbcTemplate)
                        .usingDbTime()
                        .build());
    }
}
