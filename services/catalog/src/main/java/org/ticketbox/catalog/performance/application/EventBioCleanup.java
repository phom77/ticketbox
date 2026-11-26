package org.ticketbox.catalog.performance.application;

import java.util.UUID;

/**
 * What deleting a draft event needs from artist bio generation, which owns the generated PDFs. Implemented by the
 * artistbio capability so that capability depends on events and not the reverse.
 */
public interface EventBioCleanup {
    /**
     * Reads what the event's bio jobs stored and returns the removal to run after the deletion commits. Documents
     * outside the storage root are never touched.
     */
    Runnable documentsRemoval(UUID eventId);
}
