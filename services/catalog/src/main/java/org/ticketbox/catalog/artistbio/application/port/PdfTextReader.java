package org.ticketbox.catalog.artistbio.application.port;

import java.nio.file.Path;

public interface PdfTextReader {
    ExtractedPdf extract(Path path);
}
