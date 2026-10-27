package com.ticketbox.module.concert;

import java.util.UUID;

public interface ConcertArtistBioPort {

    ConcertArtistBioView requireAccessibleConcert(
            UUID concertId,
            UUID requesterId,
            boolean admin);

    ConcertArtistBioView requireConcert(UUID concertId);

    void applyArtistBio(
            UUID concertId,
            String artistBio,
            UUID requesterId,
            boolean admin,
            boolean overwrite);
}
