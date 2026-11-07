package org.ticketbox.checkin.guestlist.application.port;

import org.ticketbox.checkin.application.port.Upload;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

public interface GuestListFiles {
    Path incomingRoot();

    Path storeUpload(UUID concertId, Upload file) throws IOException;

    Path storeScheduledUpload(UUID concertId, Upload file) throws IOException;

    Path claimScheduledFile(UUID concertId, Path source) throws IOException;

    Path archive(Path source, UUID concertId, boolean partial) throws IOException;

    Path quarantine(Path source, UUID concertId) throws IOException;

    void deleteQuietly(Path path);

    boolean isStableCsv(Path path, Instant now);

    long size(Path path) throws IOException;

    String checksum(Path path) throws IOException;

    Path errorReportPath(UUID concertId, UUID batchLogId, boolean failed) throws IOException;
}
