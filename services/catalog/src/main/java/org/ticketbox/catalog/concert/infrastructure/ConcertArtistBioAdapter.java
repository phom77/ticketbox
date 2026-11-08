package org.ticketbox.catalog.concert.infrastructure;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioPort;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioView;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.infrastructure.cache.PublicCatalogCache;

import java.util.List;
import java.util.UUID;

@Component
public class ConcertArtistBioAdapter implements ConcertArtistBioPort {

    private final ConcertRepository concertRepository;
    private final RedisTemplate<String, Object> redisTemplate;

    public ConcertArtistBioAdapter(
            ConcertRepository concertRepository, RedisTemplate<String, Object> redisTemplate) {
        this.concertRepository = concertRepository;
        this.redisTemplate = redisTemplate;
    }

    @Override
    @Transactional(readOnly = true)
    public ConcertArtistBioView requireAccessibleConcert(
            UUID concertId, UUID requesterId, boolean admin) {
        Concert concert = requireEntity(concertId);
        if (!admin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
        }
        return toView(concert);
    }

    @Override
    @Transactional(readOnly = true)
    public ConcertArtistBioView requireConcert(UUID concertId) {
        return toView(requireEntity(concertId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> findConcertIdsOwnedBy(UUID organizerId) {
        return concertRepository.findByCreatedBy(organizerId).stream().map(Concert::getId).toList();
    }

    @Override
    @Transactional
    public void applyArtistBio(
            UUID concertId, String artistBio, UUID requesterId, boolean admin, boolean overwrite) {
        Concert concert = requireEntity(concertId);
        if (!admin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
        }
        if (!overwrite && concert.getArtistBio() != null && !concert.getArtistBio().isBlank()) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_ALREADY_EXISTS, "error.artist-bio.overwrite-required");
        }
        concert.setArtistBio(artistBio);
        concertRepository.save(concert);
        evictCaches(concertId);
    }

    private Concert requireEntity(UUID concertId) {
        return concertRepository
                .findById(concertId)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found"));
    }

    private ConcertArtistBioView toView(Concert concert) {
        return new ConcertArtistBioView(
                concert.getId(), concert.getTitle(), concert.getArtistBio());
    }

    private void evictCaches(UUID concertId) {
        PublicCatalogCache.evictAfterCommit(redisTemplate, concertId);
    }
}
