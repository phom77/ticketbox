package com.ticketbox.module.admin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record BatchLogResponse(
        UUID id,
        String jobName,
        UUID concertId,
        String source,
        String fileName,
        String checksum,
        String status,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        int totalRows,
        int successRows,
        int errorRows,
        String errorDetail,
        String filePath,
        String errorReportPath) {}
