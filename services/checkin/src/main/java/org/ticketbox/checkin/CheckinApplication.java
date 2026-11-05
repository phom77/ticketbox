package org.ticketbox.checkin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.ticketbox.split.*;
import com.ticketbox.module.concert.infrastructure.*;

@SpringBootApplication(scanBasePackages = {"org.ticketbox.checkin","com.ticketbox.module.checkin"})
@EntityScan({"org.springframework.modulith.events.jpa","com.ticketbox.module.concert.domain","com.ticketbox.module.checkin.domain","com.ticketbox.module.admin.domain"})
@EnableJpaRepositories({"com.ticketbox.module.concert.domain","com.ticketbox.module.checkin.domain","com.ticketbox.module.admin.domain"})
@EnableScheduling
@EnableAsync
@Import({SplitCommon.class, ConcertOrderAdapter.class, ConcertReportingAdapter.class,
        ConcertCheckinAdapter.class, ProjectionApi.class,
        com.ticketbox.module.admin.application.BatchLogService.class,
        com.ticketbox.module.admin.application.GuestListAccessService.class,
        com.ticketbox.module.admin.application.GuestListImportService.class,
        com.ticketbox.module.admin.application.GuestListManagementService.class,
        com.ticketbox.module.admin.application.GuestListService.class,
        com.ticketbox.module.admin.infrastructure.batch.BatchTrackingListener.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListFileStorage.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListImportBatchConfiguration.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListImportJobListener.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListImportScheduler.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListImportTasklet.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListJobRunner.class,
        com.ticketbox.module.admin.infrastructure.batch.GuestListProcessor.class,
        com.ticketbox.module.admin.web.GuestListAdminController.class,
        com.ticketbox.module.admin.web.OrganizerGuestListController.class,
        com.ticketbox.module.admin.web.StaffGuestListController.class})
public class CheckinApplication {
    public static void main(String[] args) {
        SpringApplication.run(CheckinApplication.class, args);
    }

    @Bean
    ProjectionReceiver projections(JdbcTemplate jdbc) {
        return new ProjectionReceiver(jdbc, false);
    }
}
