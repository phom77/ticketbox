package org.ticketbox.catalog.artistbio.application.port;

import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ArtistPdfJobRepository {

    Optional<ArtistPdfJob> findByIdForUpdate(UUID id);

    Optional<ArtistPdfJob> findFirstByConcertIdAndFileChecksumAndStatusInOrderByCreatedAtDesc(
            UUID concertId, String fileChecksum, Collection<ArtistPdfJob.Status> statuses);

    List<ArtistPdfJob> findByStatusAndCreatedAtBefore(
            ArtistPdfJob.Status status, OffsetDateTime createdBefore);

    List<ArtistPdfJob> findByStatusAndStartedAtBefore(
            ArtistPdfJob.Status status, OffsetDateTime startedBefore);

    <S extends ArtistPdfJob> S save(S entity);

    <S extends ArtistPdfJob> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<ArtistPdfJob> findById(java.util.UUID id);

    void delete(ArtistPdfJob entity);

    void deleteById(java.util.UUID id);

    void flush();

    java.util.List<ArtistPdfJob> findAllById(Iterable<java.util.UUID> ids);

    org.springframework.data.domain.Page<ArtistPdfJob> search(
            java.util.UUID concertId,
            java.util.List<java.util.UUID> accessibleConcerts,
            ArtistPdfJob.Status status,
            org.springframework.data.domain.Pageable pageable);
}
