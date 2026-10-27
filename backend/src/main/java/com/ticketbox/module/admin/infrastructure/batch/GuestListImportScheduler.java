package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.application.GuestListImportService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class GuestListImportScheduler {

    private final GuestListFileStorage fileStorage;
    private final GuestListImportService importService;

    public GuestListImportScheduler(
            GuestListFileStorage fileStorage,
            GuestListImportService importService) {
        this.fileStorage = fileStorage;
        this.importService = importService;
    }

    @Scheduled(cron = "${ticketbox.guest-list.cron:0 0 3 * * *}")
    @SchedulerLock(
            name = "guestListImportScheduler",
            lockAtLeastFor = "PT5S",
            lockAtMostFor = "PT10M")
    public void importAvailableFiles() {
        importService.importAvailableFiles();
    }
}
