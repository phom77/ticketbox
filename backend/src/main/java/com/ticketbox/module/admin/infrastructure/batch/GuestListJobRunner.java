package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class GuestListJobRunner {

    private final JobLauncher jobLauncher;
    private final Job guestListImportJob;
    private final BatchLogRepository batchLogRepository;
    private final GuestListFileStorage fileStorage;

    public GuestListJobRunner(
            JobLauncher jobLauncher,
            @Qualifier("guestListImportJob") Job guestListImportJob,
            BatchLogRepository batchLogRepository,
            GuestListFileStorage fileStorage) {
        this.jobLauncher = jobLauncher;
        this.guestListImportJob = guestListImportJob;
        this.batchLogRepository = batchLogRepository;
        this.fileStorage = fileStorage;
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
        batchLogRepository.findById(batchLogId).ifPresent(log -> {
            log.setStatus(BatchLog.Status.FAILED);
            log.setCompletedAt(OffsetDateTime.now());
            log.setErrorDetail("Không thể khởi chạy job import: " + exception.getMessage());
            try {
                Path source = Path.of(log.getFilePath());
                if (Files.exists(source)) {
                    log.setFilePath(fileStorage.quarantine(source, log.getConcertId()).toString());
                }
            } catch (Exception moveException) {
                log.setErrorDetail(log.getErrorDetail()
                        + "; Không thể di chuyển file: " + moveException.getMessage());
            }
            batchLogRepository.save(log);
        });
    }
}
