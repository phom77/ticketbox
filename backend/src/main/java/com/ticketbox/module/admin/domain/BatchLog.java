package com.ticketbox.module.admin.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "batch_logs")
@Getter
@NoArgsConstructor
public class BatchLog extends BaseEntity {

    public enum Status {
        PENDING, RUNNING, SUCCESS, PARTIAL, FAILED, SKIPPED
    }

    public enum Source {
        UPLOAD, SCHEDULED
    }

    @Column(name = "job_name", nullable = false, length = 100)
    private String jobName;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "concert_id")
    private UUID concertId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", length = 20)
    private Source source;

    @Column(name = "checksum", length = 64)
    private String checksum;

    @Column(name = "file_path", length = 1000)
    private String filePath;

    @Column(name = "error_report_path", length = 1000)
    private String errorReportPath;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    @Column(name = "total_rows", nullable = false)
    private int totalRows = 0;

    @Column(name = "success_rows", nullable = false)
    private int successRows = 0;

    @Column(name = "error_rows", nullable = false)
    private int errorRows = 0;

    @Column(name = "error_detail", columnDefinition = "TEXT")
    private String errorDetail;

    public void setJobName(String jobName) {
        this.jobName = jobName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setSource(Source source) {
        this.source = source;
    }

    public void setChecksum(String checksum) {
        this.checksum = checksum;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public void setErrorReportPath(String errorReportPath) {
        this.errorReportPath = errorReportPath;
    }

    public void setStartedAt(OffsetDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public void setCompletedAt(OffsetDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public void setTotalRows(int totalRows) {
        this.totalRows = totalRows;
    }

    public void setSuccessRows(int successRows) {
        this.successRows = successRows;
    }

    public void setErrorRows(int errorRows) {
        this.errorRows = errorRows;
    }

    public void setErrorDetail(String errorDetail) {
        this.errorDetail = errorDetail;
    }
}
