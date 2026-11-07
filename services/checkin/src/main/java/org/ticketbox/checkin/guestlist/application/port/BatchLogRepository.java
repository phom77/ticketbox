package org.ticketbox.checkin.guestlist.application.port;

import org.ticketbox.checkin.guestlist.domain.BatchLog;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface BatchLogRepository {

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
            UUID concertId, String checksum, Collection<BatchLog.Status> statuses);

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusOrderByStartedAtDesc(
            UUID concertId, String checksum, BatchLog.Status status);

    Optional<BatchLog> findFirstByConcertIdAndFilePathAndStatus(
            UUID concertId, String filePath, BatchLog.Status status);

    <S extends BatchLog> S save(S entity);

    <S extends BatchLog> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<BatchLog> findById(java.util.UUID id);

    void delete(BatchLog entity);

    void deleteById(java.util.UUID id);

    void flush();

    <S extends BatchLog> S saveAndFlush(S log);

    org.springframework.data.domain.Page<BatchLog> search(
            java.util.UUID concertId,
            java.util.List<java.util.UUID> accessibleConcerts,
            BatchLog.Status status,
            BatchLog.Source source,
            org.springframework.data.domain.Pageable pageable);
}
