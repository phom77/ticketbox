package org.ticketbox.catalog.artistbio.application.dto;

import java.util.UUID;

public record ArtistBioJobSubmissionResponse(UUID jobId, String status, String statusUrl) {}
