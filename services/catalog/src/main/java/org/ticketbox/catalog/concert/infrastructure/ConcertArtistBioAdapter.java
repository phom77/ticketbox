package org.ticketbox.catalog.concert.infrastructure;

import org.ticketbox.catalog.concert.ConcertArtistBioPort;
import org.ticketbox.catalog.concert.ConcertArtistBioView;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.concert.domain.ConcertRepository;
import org.ticketbox.catalog.web.AppException;
import org.ticketbox.catalog.web.ErrorCode;
import org.ticketbox.catalog.cache.PublicCatalogCache;
import java.util.List;
import java.util.UUID;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ConcertArtistBioAdapter implements ConcertArtistBioPort {

    private final ConcertRepository concertRepository;
    private final RedisTemplate<String, Object> redisTemplate;

    public ConcertArtistBioAdapter(
            ConcertRepository concertRepository,
            RedisTemplate<String, Object> redisTemplate) {
        this.concertRepository = concertRepository;
        this.redisTemplate = redisTemplate;
    }

    @Override
    @Transactional(readOnly = true)
    public ConcertArtistBioView requireAccessibleConcert(
            UUID concertId,
            UUID requesterId,
            boolean admin) {
        Concert concert = requireEntity(concertId);
        if (!admin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
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
            UUID concertId,
            String artistBio,
            UUID requesterId,
            boolean admin,
            boolean overwrite) {
        Concert concert = requireEntity(concertId);
        if (!admin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
        if (!overwrite && concert.getArtistBio() != null && !concert.getArtistBio().isBlank()) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_ALREADY_EXISTS,
                    "Concert đã có giới thiệu nghệ sĩ; hãy bật overwrite=true để thay thế");
        }
        concert.setArtistBio(artistBio);
        concertRepository.save(concert);
        evictCaches(concertId);
    }

    private Concert requireEntity(UUID concertId) {
        return concertRepository.findById(concertId)
                .orElseThrow(() -> new AppException(
                        ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert"));
    }

    private ConcertArtistBioView toView(Concert concert) {
        return new ConcertArtistBioView(
                concert.getId(),
                concert.getTitle(),
                concert.getArtistBio());
    }

    private void evictCaches(UUID concertId) {
        PublicCatalogCache.evictAfterCommit(redisTemplate, concertId);
    }
}
