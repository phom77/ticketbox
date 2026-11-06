package org.ticketbox.catalog.concert;

import java.util.List;
import java.util.UUID;

public interface ConcertArtistBioPort {

    ConcertArtistBioView requireAccessibleConcert(
            UUID concertId,
            UUID requesterId,
            boolean admin);

    List<UUID> findConcertIdsOwnedBy(UUID organizerId);

    ConcertArtistBioView requireConcert(UUID concertId);

    void applyArtistBio(
            UUID concertId,
            String artistBio,
            UUID requesterId,
            boolean admin,
            boolean overwrite);
}
