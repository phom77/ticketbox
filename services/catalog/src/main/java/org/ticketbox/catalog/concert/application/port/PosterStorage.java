package org.ticketbox.catalog.concert.application.port;

import org.ticketbox.catalog.application.port.Upload;

import java.util.UUID;

public interface PosterStorage {

    StoredPoster upload(UUID concertId, Upload file);

    void deleteBestEffort(String publicId);

    record StoredPoster(String secureUrl, String publicId) {}
}
