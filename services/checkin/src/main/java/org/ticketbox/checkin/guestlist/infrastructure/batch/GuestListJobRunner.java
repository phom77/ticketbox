package org.ticketbox.checkin.guestlist.infrastructure.batch;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.ticketbox.checkin.guestlist.application.port.BatchLogRepository;
import org.ticketbox.checkin.guestlist.application.port.GuestListMessages;
import org.ticketbox.checkin.guestlist.domain.BatchLog;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;

@Component
public class GuestListJobRunner
        implements org.ticketbox.checkin.guestlist.application.port.GuestListJobs {

    private final JobLauncher jobLauncher;
    private final Job guestListImportJob;
    private final BatchLogRepository batchLogRepository;
    private final GuestListFileStorage fileStorage;
    private final GuestListMessages messages;

    public GuestListJobRunner(
            JobLauncher jobLauncher,
            @Qualifier("guestListImportJob") Job guestListImportJob,
            BatchLogRepository batchLogRepository,
            GuestListFileStorage fileStorage,
            GuestListMessages messages) {
        this.jobLauncher = jobLauncher;
        this.guestListImportJob = guestListImportJob;
        this.batchLogRepository = batchLogRepository;
        this.fileStorage = fileStorage;
        this.messages = messages;
    }

    @Async("guestListImportExecutor")
    public void launch(BatchLog batchLog) {
        try {
            jobLauncher.run(
                    guestListImportJob,
                    new JobParametersBuilder()
                            .addString("batchLogId", batchLog.getId().toString())
                            .addString("concertId", batchLog.getConcertId().toString())
                            .addString("filePath", batchLog.getFilePath())
                            .addString("fileName", batchLog.getFileName())
                            .addLong("submittedAt", System.currentTimeMillis())
                            .toJobParameters());
        } catch (Exception ex) {
            markLaunchFailure(batchLog.getId(), ex);
        }
    }

    private void markLaunchFailure(UUID batchLogId, Exception exception) {
        batchLogRepository
                .findById(batchLogId)
                .ifPresent(
                        log -> {
                            log.setStatus(BatchLog.Status.FAILED);
                            log.setCompletedAt(OffsetDateTime.now());
                            log.setErrorDetail(
                                    messages.text(
                                            "guest-import.launch-failed", exception.getMessage()));
                            try {
                                Path source = Path.of(log.getFilePath());
                                if (Files.exists(source)) {
                                    log.setFilePath(
                                            fileStorage
                                                    .quarantine(source, log.getConcertId())
                                                    .toString());
                                }
                            } catch (Exception moveException) {
                                log.setErrorDetail(
                                        log.getErrorDetail()
                                                + "; "
                                                + messages.text(
                                                        "guest-import.move-failed",
                                                        moveException.getMessage()));
                            }
                            batchLogRepository.save(log);
                        });
    }
}
