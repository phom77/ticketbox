package org.ticketbox.catalog.concert.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.concert.application.dto.SalePublication;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConcertRepository {

    java.util.Optional<Concert> findByIdForUpdate(java.util.UUID id);

    Page<Concert> findByStatusIn(List<Concert.Status> statuses, Pageable pageable);

    Page<Concert> findByStatusInAndPublicVisibleTrue(
            List<Concert.Status> statuses, Pageable pageable);

    Page<Concert> findByStatus(Concert.Status status, Pageable pageable);

    Optional<SalePublication.Versions> publication(UUID id);

    Page<Concert> search(UUID organizationId, Concert.Status status, String query, Pageable pageable);

    Optional<Concert> findByIdAndCreatedBy(UUID id, UUID organizationId);

    Page<Concert> findByOrganizationIdAndStatus(
            UUID organizationId, Concert.Status status, Pageable pageable);

    Page<Concert> findByOrganizationId(UUID organizationId, Pageable pageable);

    List<Concert> findByOrganizationId(UUID organizationId);

    Optional<Concert> findByIdAndStatusIn(UUID id, List<Concert.Status> statuses);

    Optional<Concert> findByIdAndStatusInAndPublicVisibleTrue(
            UUID id, List<Concert.Status> statuses);

    List<Concert> findByEventDateBetweenAndStatusIn(
            OffsetDateTime from, OffsetDateTime to, List<Concert.Status> statuses);

    <S extends Concert> S save(S entity);

    <S extends Concert> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<Concert> findById(java.util.UUID id);

    void delete(Concert entity);

    void deleteById(java.util.UUID id);

    void flush();

    <S extends Concert> S saveAndFlush(S concert);

    org.springframework.data.domain.Page<Concert> findAll(
            org.springframework.data.domain.Pageable pageable);

    boolean existsById(java.util.UUID id);
}
