package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.batch.core.BatchStatus;
import org.springframework.batch.core.JobExecution;
import org.springframework.batch.core.JobExecutionListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class GuestListImportJobListener implements JobExecutionListener {

    private final BatchLogRepository batchLogRepository;
    private final GuestListFileStorage fileStorage;

    public GuestListImportJobListener(
            BatchLogRepository batchLogRepository,
            GuestListFileStorage fileStorage) {
        this.batchLogRepository = batchLogRepository;
        this.fileStorage = fileStorage;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void afterJob(JobExecution jobExecution) {
        String batchLogValue = jobExecution.getJobParameters().getString("batchLogId");
        String concertValue = jobExecution.getJobParameters().getString("concertId");
        String filePathValue = jobExecution.getJobParameters().getString("filePath");
        if (batchLogValue == null || concertValue == null || filePathValue == null) {
            return;
        }

        UUID batchLogId = UUID.fromString(batchLogValue);
        UUID concertId = UUID.fromString(concertValue);
        Path filePath = Path.of(filePathValue);
        BatchLog log = batchLogRepository.findById(batchLogId).orElse(null);
        if (log == null) {
            return;
        }

        boolean jobFailed = jobExecution.getStatus() != BatchStatus.COMPLETED
                || log.getStatus() == BatchLog.Status.RUNNING
                || log.getStatus() == BatchLog.Status.FAILED;
        if (jobFailed) {
            if (log.getStatus() != BatchLog.Status.FAILED) {
                log.setStatus(BatchLog.Status.FAILED);
                log.setErrorDetail(failureSummary(jobExecution));
            }
        }

        try {
            if (Files.exists(filePath)) {
                Path finalPath = jobFailed
                        ? fileStorage.quarantine(filePath, concertId)
                        : fileStorage.archive(
                                filePath,
                                concertId,
                                log.getStatus() == BatchLog.Status.PARTIAL);
                log.setFilePath(finalPath.toString());
            }
        } catch (Exception ex) {
            log.setErrorDetail(append(log.getErrorDetail(), "Không thể di chuyển file: " + ex.getMessage()));
        }

        log.setCompletedAt(OffsetDateTime.now());
        batchLogRepository.save(log);
    }

    private String failureSummary(JobExecution execution) {
        String message = execution.getAllFailureExceptions().stream()
                .map(Throwable::getMessage)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse("Import danh sách khách mời thất bại");
        return message.length() <= 4000 ? message : message.substring(0, 4000);
    }

    private String append(String current, String addition) {
        if (current == null || current.isBlank()) {
            return addition;
        }
        return current + "; " + addition;
    }
}
