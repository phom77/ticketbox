package org.ticketbox.ticketing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.ticketbox.split.*;
import com.ticketbox.module.concert.infrastructure.*;
import com.ticketbox.infrastructure.integration.*;
import com.ticketbox.module.payment.application.RemotePaymentOperations;
import com.ticketbox.module.admin.application.*;
import com.ticketbox.module.admin.web.OrganizerRevenueController;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;

@SpringBootApplication(scanBasePackages = {"org.ticketbox.ticketing","com.ticketbox.module.ticket",
        "com.ticketbox.module.queue","com.ticketbox.module.inventory","com.ticketbox.infrastructure.redis",
        "com.ticketbox.infrastructure.web","com.ticketbox.infrastructure.websocket","com.ticketbox.infrastructure.rabbitmq",
        "com.ticketbox.module.payment.web","com.ticketbox.module.payment.infrastructure",
        "com.ticketbox.module.payment.application.gateway"})
@EntityScan({"org.springframework.modulith.events.jpa","com.ticketbox.module.ticket.domain","com.ticketbox.module.concert.domain"})
@EnableJpaRepositories({"com.ticketbox.module.ticket.domain","com.ticketbox.module.concert.domain"})
@ConfigurationPropertiesScan({"com.ticketbox.infrastructure.redis","com.ticketbox.module.payment.infrastructure"})
@EnableScheduling
@EnableAsync
@EnableSchedulerLock(defaultLockAtMostFor="PT2M")
@Import({SplitCommon.class, ConcertOrderAdapter.class, ConcertReportingAdapter.class,
        ConcertReminderAdapter.class, ProjectionApi.class, RemotePaymentOperations.class,
        PaymentWorkflowController.class, PaymentRemoteClient.class, PaymentIntentDispatcher.class,
        RemoteReminderDispatcher.class, RemoteReminderListener.class, NotificationInternalController.class,
        OrganizerRevenueService.class, RevenueReportExportService.class, OrganizerRevenueController.class})
public class TicketingApplication {
    public static void main(String[] args) {
        SpringApplication.run(TicketingApplication.class, args);
    }

    @Bean
    ProjectionReceiver projections(JdbcTemplate jdbc) {
        return new ProjectionReceiver(jdbc, true);
    }

    @Bean
    LockProvider lockProvider(JdbcTemplate jdbc) {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder().withJdbcTemplate(jdbc).usingDbTime().build());
    }
}
