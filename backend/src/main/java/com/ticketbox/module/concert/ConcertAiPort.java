package com.ticketbox.module.concert;

import java.util.UUID;

public interface ConcertAiPort {
    void updateArtistBio(UUID concertId, String bio);
}
