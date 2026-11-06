package com.ticketbox.module.ai.application;

import java.util.UUID;

/** The FQCN is persisted in event_publication and must be readable by both Catalog images. */
public record ArtistBioJobSubmittedEvent(UUID jobId) {
}
