package com.ticketbox.module.ai.infrastructure;

import java.nio.file.Path;

public record StoredArtistPdf(
        Path path,
        String originalFileName,
        String checksum) {
}
