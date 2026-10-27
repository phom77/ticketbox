package com.ticketbox.module.ai.domain;

import java.util.Collection;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ArtistPdfJobRepository extends JpaRepository<ArtistPdfJob, UUID>, JpaSpecificationExecutor<ArtistPdfJob> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select job from ArtistPdfJob job where job.id=:id")
    Optional<ArtistPdfJob> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") UUID id);

    Optional<ArtistPdfJob> findFirstByConcertIdAndFileChecksumAndStatusInOrderByCreatedAtDesc(
            UUID concertId,
            String fileChecksum,
            Collection<ArtistPdfJob.Status> statuses);

    List<ArtistPdfJob> findByStatusAndCreatedAtBefore(
            ArtistPdfJob.Status status,
            OffsetDateTime createdBefore);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    List<ArtistPdfJob> findByStatusAndStartedAtBefore(
            ArtistPdfJob.Status status,
            OffsetDateTime startedBefore);
}
