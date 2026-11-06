package org.ticketbox.catalog.concert.application.port;

import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

public interface PosterStorage {

    StoredPoster upload(UUID concertId, MultipartFile file);

    void deleteBestEffort(String publicId);

    record StoredPoster(String secureUrl, String publicId) {}
}
