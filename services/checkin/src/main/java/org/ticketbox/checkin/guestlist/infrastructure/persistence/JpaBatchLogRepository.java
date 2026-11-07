package org.ticketbox.checkin.guestlist.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.ticketbox.checkin.guestlist.domain.BatchLog;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface JpaBatchLogRepository
        extends org.ticketbox.checkin.guestlist.application.port.BatchLogRepository,
                JpaRepository<BatchLog, UUID>,
                JpaSpecificationExecutor<BatchLog> {

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
            UUID concertId, String checksum, Collection<BatchLog.Status> statuses);

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusOrderByStartedAtDesc(
            UUID concertId, String checksum, BatchLog.Status status);

    Optional<BatchLog> findFirstByConcertIdAndFilePathAndStatus(
            UUID concertId, String filePath, BatchLog.Status status);

    default org.springframework.data.domain.Page<BatchLog> search(
            java.util.UUID concertId,
            java.util.List<java.util.UUID> accessibleConcerts,
            BatchLog.Status status,
            BatchLog.Source source,
            org.springframework.data.domain.Pageable pageable) {
        org.springframework.data.jpa.domain.Specification<BatchLog> filter =
                (root, query, builder) -> builder.equal(root.get("jobName"), "GUEST_LIST_IMPORT");
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
        if (source != null)
            filter =
                    filter.and((root, query, builder) -> builder.equal(root.get("source"), source));
        return findAll(filter, pageable);
    }
}
