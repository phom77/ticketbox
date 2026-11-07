package org.ticketbox.catalog.artistbio.application.port;

import org.ticketbox.catalog.artistbio.application.ArtistBioGenerator;

public interface ArtistBioGenerators {
    ArtistBioGenerator resolve();
}
