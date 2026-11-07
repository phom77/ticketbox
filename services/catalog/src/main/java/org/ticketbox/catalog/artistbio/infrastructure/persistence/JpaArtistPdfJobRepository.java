package org.ticketbox.catalog.artistbio.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JpaArtistPdfJobRepository
        extends org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository,
                JpaRepository<ArtistPdfJob, UUID>,
                JpaSpecificationExecutor<ArtistPdfJob> {

    @org.springframework.data.jpa.repository.Lock(
            jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
            "select job from ArtistPdfJob job where job.id=:id")
    Optional<ArtistPdfJob> findByIdForUpdate(
            @org.springframework.data.repository.query.Param("id") UUID id);

    Optional<ArtistPdfJob> findFirstByConcertIdAndFileChecksumAndStatusInOrderByCreatedAtDesc(
            UUID concertId, String fileChecksum, Collection<ArtistPdfJob.Status> statuses);

    List<ArtistPdfJob> findByStatusAndCreatedAtBefore(
            ArtistPdfJob.Status status, OffsetDateTime createdBefore);

    @org.springframework.data.jpa.repository.Lock(
            jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    List<ArtistPdfJob> findByStatusAndStartedAtBefore(
            ArtistPdfJob.Status status, OffsetDateTime startedBefore);

    default org.springframework.data.domain.Page<ArtistPdfJob> search(
            java.util.UUID concertId,
            java.util.List<java.util.UUID> accessibleConcerts,
            ArtistPdfJob.Status status,
            org.springframework.data.domain.Pageable pageable) {
        org.springframework.data.jpa.domain.Specification<ArtistPdfJob> filter =
                org.springframework.data.jpa.domain.Specification.where(null);
        if (concertId != null)
            filter =
                    filter.and(
                            (root, query, builder) ->
                                    builder.equal(root.get("concertId"), concertId));
        if (accessibleConcerts != null)
            filter =
                    filter.and(
                            (root, query, builder) ->
                                    accessibleConcerts.isEmpty()
                                            ? builder.disjunction()
                                            : root.get("concertId").in(accessibleConcerts));
        if (status != null)
            filter =
                    filter.and((root, query, builder) -> builder.equal(root.get("status"), status));
        return findAll(filter, pageable);
    }
}
