package com.ticketbox.module.concert.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ConcertRepository extends JpaRepository<Concert, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Concert c where c.id=:id")
    java.util.Optional<Concert> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") java.util.UUID id);


    Page<Concert> findByStatusIn(List<Concert.Status> statuses, Pageable pageable);

    Page<Concert> findByStatusInAndPublicVisibleTrue(List<Concert.Status> statuses, Pageable pageable);

    Page<Concert> findByStatus(Concert.Status status, Pageable pageable);

    Optional<Concert> findByIdAndCreatedBy(UUID id, UUID createdBy);

    Page<Concert> findByCreatedByAndStatus(
            UUID createdBy,
            Concert.Status status,
            Pageable pageable);

    Page<Concert> findByCreatedBy(UUID createdBy, Pageable pageable);

    List<Concert> findByCreatedBy(UUID createdBy);

    Optional<Concert> findByIdAndStatusIn(UUID id, List<Concert.Status> statuses);

    Optional<Concert> findByIdAndStatusInAndPublicVisibleTrue(UUID id, List<Concert.Status> statuses);

    List<Concert> findByEventDateBetweenAndStatusIn(
            OffsetDateTime from,
            OffsetDateTime to,
            List<Concert.Status> statuses);
}
