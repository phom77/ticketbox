package org.ticketbox.catalog.concert.application.port;

import java.util.UUID;

public record ConcertArtistBioView(UUID id, String title, String artistBio) {}
