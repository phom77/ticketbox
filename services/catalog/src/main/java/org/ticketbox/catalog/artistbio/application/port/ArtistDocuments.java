package org.ticketbox.catalog.artistbio.application.port;

import org.ticketbox.catalog.application.port.Upload;

import java.nio.file.Path;
import java.util.UUID;

public interface ArtistDocuments {
    StoredArtistPdf store(UUID concertId, Upload file);

    Path requireStoredPath(String value);

    void deleteQuietly(Path path);
}
