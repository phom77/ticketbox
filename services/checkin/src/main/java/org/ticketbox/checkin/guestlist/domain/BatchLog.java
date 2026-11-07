package org.ticketbox.checkin.guestlist.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.checkin.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class BatchLog extends BaseEntity {

    public enum Status {
        PENDING,
        RUNNING,
        SUCCESS,
        PARTIAL,
        FAILED,
        SKIPPED
    }

    public enum Source {
        UPLOAD,
        SCHEDULED
    }

    private String jobName;

    private String fileName;

    private UUID concertId;

    private Source source;

    private String checksum;

    private String filePath;

    private String errorReportPath;

    private OffsetDateTime startedAt;

    private OffsetDateTime completedAt;

    private Status status;

    private int totalRows = 0;

    private int successRows = 0;

    private int errorRows = 0;

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
