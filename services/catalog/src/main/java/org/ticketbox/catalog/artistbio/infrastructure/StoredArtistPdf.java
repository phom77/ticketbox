package org.ticketbox.catalog.artistbio.infrastructure;

import java.nio.file.Path;

public record StoredArtistPdf(
        Path path,
        String originalFileName,
        String checksum) {
}
