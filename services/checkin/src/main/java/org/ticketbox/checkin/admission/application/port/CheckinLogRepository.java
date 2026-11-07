package org.ticketbox.checkin.admission.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.checkin.admission.domain.CheckinLog;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface CheckinLogRepository {

    boolean existsByTicketId(UUID ticketId);

    java.util.Optional<CheckinLog> findByTicketId(UUID ticketId);

    Page<CheckinLog> findByConcertId(UUID concertId, Pageable pageable);

    long countByConcertId(UUID concertId);

    long countOfflineByConcertId(UUID concertId);

    OffsetDateTime findLatestCheckedAtByConcertId(UUID concertId);

    int insertOfflineIfAbsent(
            UUID id,
            UUID ticketId,
            UUID concertId,
            UUID staffId,
            String deviceId,
            OffsetDateTime checkedAt,
            OffsetDateTime syncAt,
            String gate,
            String notes);

    int deleteInsertedOfflineLog(UUID id);

    <S extends CheckinLog> S save(S entity);

    <S extends CheckinLog> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<CheckinLog> findById(java.util.UUID id);

    void delete(CheckinLog entity);

    void deleteById(java.util.UUID id);

    void flush();
}
