package com.ticketbox.module.concert;

import java.util.UUID;

public record ConcertArtistBioView(
        UUID id,
        String title,
        String artistBio) {
}
