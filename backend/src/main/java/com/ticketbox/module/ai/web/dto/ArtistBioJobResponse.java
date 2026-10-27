package com.ticketbox.module.ai.web.dto;

import com.ticketbox.module.ai.domain.ArtistPdfJob;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ArtistBioJobResponse(
        UUID id,
        UUID concertId,
        String originalFileName,
        String status,
        String provider,
        String model,
        Integer extractedCharCount,
        String resultBio,
        String errorMessage,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        OffsetDateTime appliedAt,
        UUID appliedBy,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public static ArtistBioJobResponse from(ArtistPdfJob job) {
        return new ArtistBioJobResponse(
                job.getId(),
                job.getConcertId(),
                job.getOriginalFileName(),
                job.getStatus().name(),
                job.getProvider(),
                job.getModel(),
                job.getExtractedCharCount(),
                job.getResultBio(),
                job.getErrorMessage(),
                job.getStartedAt(),
                job.getCompletedAt(),
                job.getAppliedAt(),
                job.getAppliedBy(),
                job.getCreatedAt(),
                job.getUpdatedAt());
    }
}
