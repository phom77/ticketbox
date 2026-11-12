package org.ticketbox.catalog.concert.infrastructure.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.concert.application.dto.SalePublication;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface JpaConcertRepository
        extends org.ticketbox.catalog.concert.application.port.ConcertRepository,
                JpaRepository<Concert, UUID> {
    @org.springframework.data.jpa.repository.Lock(
            jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Concert c where c.id=:id")
    java.util.Optional<Concert> findByIdForUpdate(
            @org.springframework.data.repository.query.Param("id") java.util.UUID id);

    Page<Concert> findByStatusIn(List<Concert.Status> statuses, Pageable pageable);

    String BUYER_VISIBLE = "c.status in :statuses and c.publicVisible = true and not exists "
            + "(select p.concertId from CatalogSalePublication p where p.concertId = c.id "
            + "and p.activationVersion > p.ticketingVersion)";

    @Query("select c from Concert c where " + BUYER_VISIBLE)
    Page<Concert> findByStatusInAndPublicVisibleTrue(
            List<Concert.Status> statuses, Pageable pageable);

    Page<Concert> findByStatus(Concert.Status status, Pageable pageable);

    Optional<Concert> findByIdAndCreatedBy(UUID id, UUID organizationId);

    Page<Concert> findByOrganizationIdAndStatus(
            UUID organizationId, Concert.Status status, Pageable pageable);

    Page<Concert> findByOrganizationId(UUID organizationId, Pageable pageable);

    List<Concert> findByOrganizationId(UUID organizationId);

    Optional<Concert> findByIdAndStatusIn(UUID id, List<Concert.Status> statuses);

    @Query("select c from Concert c where c.id = :id and " + BUYER_VISIBLE)
    Optional<Concert> findByIdAndStatusInAndPublicVisibleTrue(
            UUID id, List<Concert.Status> statuses);

    @Query("""
            select new org.ticketbox.catalog.concert.application.dto.SalePublication$Versions(
                p.version, p.activationVersion, p.ticketingVersion, p.checkinVersion)
            from CatalogSalePublication p where p.concertId = :id
            """)
    Optional<SalePublication.Versions> publication(UUID id);

    @Query("""
            select c from Concert c where (:organizationId is null or c.organizationId = :organizationId)
              and (:status is null or c.status = :status)
              and (locate(lower(:query), lower(c.title)) > 0
                or locate(lower(:query), lower(c.venueName)) > 0
                or locate(lower(:query), lower(c.venueAddress)) > 0)
            """)
    Page<Concert> search(UUID organizationId, Concert.Status status, String query, Pageable pageable);

    List<Concert> findByEventDateBetweenAndStatusIn(
            OffsetDateTime from, OffsetDateTime to, List<Concert.Status> statuses);
}
