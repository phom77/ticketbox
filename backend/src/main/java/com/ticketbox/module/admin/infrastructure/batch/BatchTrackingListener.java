package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import com.ticketbox.module.admin.domain.GuestList;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.batch.core.ExitStatus;
import org.springframework.batch.core.StepExecution;
import org.springframework.batch.core.annotation.AfterStep;
import org.springframework.batch.core.annotation.BeforeStep;
import org.springframework.batch.core.SkipListener;
import org.springframework.batch.core.ItemWriteListener;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.batch.item.Chunk;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@StepScope
@RequiredArgsConstructor
@Slf4j
public class BatchTrackingListener implements SkipListener<GuestListRow, GuestList>, ItemWriteListener<GuestList> {

    private final BatchLogRepository batchLogRepository;

    private final AtomicInteger successCount = new AtomicInteger(0);
    private final AtomicInteger errorCount = new AtomicInteger(0);
    private final List<String> errorDetails = new CopyOnWriteArrayList<>();
    private UUID batchLogId;

    @BeforeStep
    public void beforeStep(StepExecution stepExecution) {
        String logIdStr = stepExecution.getJobExecution().getJobParameters().getString("batchLogId");
        if (logIdStr != null) {
            this.batchLogId = UUID.fromString(logIdStr);
        }
        this.successCount.set(0);
        this.errorCount.set(0);
        this.errorDetails.clear();
        log.info("Batch step started. Tracking BatchLog ID: {}", batchLogId);
    }

    @AfterStep
    @Transactional
    public ExitStatus afterStep(StepExecution stepExecution) {
        log.info("Batch step completed. Success: {}, Errors: {}", successCount.get(), errorCount.get());
        if (batchLogId != null) {
            batchLogRepository.findById(batchLogId).ifPresent(batchLog -> {
                int total = successCount.get() + errorCount.get();
                batchLog.setTotalRows(total);
                batchLog.setSuccessRows(successCount.get());
                batchLog.setErrorRows(errorCount.get());
                batchLog.setCompletedAt(OffsetDateTime.now());
                
                // Determine status
                if (errorCount.get() == 0 && successCount.get() > 0) {
                    batchLog.setStatus(BatchLog.Status.SUCCESS);
                } else if (successCount.get() > 0 && errorCount.get() > 0) {
                    batchLog.setStatus(BatchLog.Status.PARTIAL);
                } else {
                    batchLog.setStatus(BatchLog.Status.FAILED);
                }
                
                if (!errorDetails.isEmpty()) {
                    batchLog.setErrorDetail(String.join("\n", errorDetails));
                }
                batchLogRepository.save(batchLog);
            });
        }
        return stepExecution.getExitStatus();
    }

    @Override
    public void onSkipInRead(Throwable t) {
        errorCount.incrementAndGet();
        String msg = "Read skip: " + t.getMessage();
        errorDetails.add(msg);
        log.warn(msg);
    }

    @Override
    public void onSkipInProcess(GuestListRow item, Throwable t) {
        errorCount.incrementAndGet();
        String msg = "Process skip (phone=" + (item != null ? item.getPhone() : "unknown") + "): " + t.getMessage();
        errorDetails.add(msg);
        log.warn(msg);
    }

    @Override
    public void onSkipInWrite(GuestList item, Throwable t) {
        errorCount.incrementAndGet();
        String msg = "Write skip (phone=" + (item != null ? item.getPhone() : "unknown") + "): " + t.getMessage();
        errorDetails.add(msg);
        log.warn(msg);
    }

    @Override
    public void afterWrite(Chunk<? extends GuestList> items) {
        successCount.addAndGet(items.size());
    }

    @Override
    public void beforeWrite(Chunk<? extends GuestList> items) {
        // No-op
    }

    @Override
    public void onWriteError(Exception exception, Chunk<? extends GuestList> items) {
        // Handled via skip listener if fault tolerant
    }
}
