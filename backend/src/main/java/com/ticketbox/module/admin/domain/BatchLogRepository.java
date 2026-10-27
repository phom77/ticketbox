package com.ticketbox.module.admin.domain;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface BatchLogRepository
        extends JpaRepository<BatchLog, UUID>, JpaSpecificationExecutor<BatchLog> {

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
            UUID concertId,
            String checksum,
            Collection<BatchLog.Status> statuses);

    Optional<BatchLog> findFirstByConcertIdAndChecksumAndStatusOrderByStartedAtDesc(
            UUID concertId,
            String checksum,
            BatchLog.Status status);

    Optional<BatchLog> findFirstByConcertIdAndFilePathAndStatus(
            UUID concertId,
            String filePath,
            BatchLog.Status status);
}
