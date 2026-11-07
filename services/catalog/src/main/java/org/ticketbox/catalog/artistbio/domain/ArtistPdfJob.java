package org.ticketbox.catalog.artistbio.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.catalog.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class ArtistPdfJob extends BaseEntity {

    public enum Status {
        PENDING,
        PROCESSING,
        DONE,
        FAILED
    }

    private UUID concertId;

    private String fileUrl;

    private String originalFileName;

    private UUID requestedBy;

    private String fileChecksum;

    private Status status = Status.PENDING;

    private String provider;

    private String model;

    private Integer extractedCharCount;

    private String resultBio;

    private OffsetDateTime startedAt;

    private OffsetDateTime completedAt;

    private String errorMessage;

    private OffsetDateTime appliedAt;

    private UUID appliedBy;

    public ArtistPdfJob(
            UUID concertId,
            String fileUrl,
            String originalFileName,
            UUID requestedBy,
            String fileChecksum) {
        this.concertId = concertId;
        this.fileUrl = fileUrl;
        this.originalFileName = originalFileName;
        this.requestedBy = requestedBy;
        this.fileChecksum = fileChecksum;
        this.status = Status.PENDING;
    }

    public void startProcessing() {
        if (status != Status.PENDING) {
            throw new IllegalStateException("Only pending artist bio jobs can start processing");
        }
        status = Status.PROCESSING;
        startedAt = OffsetDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        completedAt = null;
        errorMessage = null;
    }

    public void complete(String resultBio, String provider, String model, int extractedCharCount) {
        if (status != Status.PROCESSING) {
            throw new IllegalStateException("Only processing artist bio jobs can complete");
        }
        this.resultBio = resultBio;
        this.provider = provider;
        this.model = model;
        this.extractedCharCount = extractedCharCount;
        this.status = Status.DONE;
        this.completedAt = OffsetDateTime.now();
        this.errorMessage = null;
    }

    public void fail(String errorMessage) {
        if (status != Status.PENDING && status != Status.PROCESSING) {
            throw new IllegalStateException("Only pending or processing artist bio jobs can fail");
        }
        this.status = Status.FAILED;
        this.completedAt = OffsetDateTime.now();
        this.errorMessage = errorMessage;
    }

    public void resetForRetry() {
        if (status != Status.FAILED) {
            throw new IllegalStateException("Only failed artist bio jobs can be retried");
        }
        this.status = Status.PENDING;
        this.startedAt = null;
        this.completedAt = null;
        this.provider = null;
        this.model = null;
        this.extractedCharCount = null;
        this.resultBio = null;
        this.errorMessage = null;
    }

    public void markApplied(UUID userId) {
        if (status != Status.DONE) {
            throw new IllegalStateException("Only completed artist bio jobs can be applied");
        }
        this.appliedAt = OffsetDateTime.now();
        this.appliedBy = userId;
    }
}
