package com.ticketbox.module.ai.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "artist_pdf_jobs")
@Getter
@NoArgsConstructor
public class ArtistPdfJob extends BaseEntity {

    public enum Status {
        PENDING, PROCESSING, DONE, FAILED
    }

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "file_url", nullable = false, length = 500)
    private String fileUrl;

    @Column(name = "original_file_name", nullable = false, length = 255)
    private String originalFileName;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(name = "file_checksum", nullable = false, length = 64)
    private String fileChecksum;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.PENDING;

    @Column(name = "provider", length = 50)
    private String provider;

    @Column(name = "model", length = 100)
    private String model;

    @Column(name = "extracted_char_count")
    private Integer extractedCharCount;

    @Column(name = "result_bio", columnDefinition = "TEXT")
    private String resultBio;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "applied_at")
    private OffsetDateTime appliedAt;

    @Column(name = "applied_by")
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

    public void complete(
            String resultBio,
            String provider,
            String model,
            int extractedCharCount) {
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
