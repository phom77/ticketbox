package org.ticketbox.catalog.performance.application;

import java.util.UUID;

/** What artist bio generation needs from native events; the reverse of ConcertArtistBioPort. */
public interface EventArtistBioPort {
    record EventBioView(UUID id, String title, String artistBio) {}

    /** The event of the organization (any event for the platform); not found otherwise. */
    EventBioView requireAccessibleEvent(UUID eventId, UUID requesterId, boolean admin);

    EventBioView requireEvent(UUID eventId);

    /** Saves the bio on a draft event, or stages it in the content revision once a performance is released. */
    void applyArtistBio(UUID eventId, String artistBio, UUID requesterId, boolean admin, boolean overwrite);
}
