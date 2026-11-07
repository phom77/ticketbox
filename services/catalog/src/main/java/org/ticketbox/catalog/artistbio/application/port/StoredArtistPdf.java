package org.ticketbox.catalog.artistbio.application.port;

import java.nio.file.Path;

public record StoredArtistPdf(Path path, String originalFileName, String checksum) {}
