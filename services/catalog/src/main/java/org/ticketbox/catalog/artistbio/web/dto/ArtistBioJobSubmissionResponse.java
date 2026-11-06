package org.ticketbox.catalog.artistbio.web.dto;

import java.util.UUID;

public record ArtistBioJobSubmissionResponse(
        UUID jobId,
        String status,
        String statusUrl) {
}
