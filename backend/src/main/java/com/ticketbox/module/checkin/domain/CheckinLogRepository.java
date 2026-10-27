package com.ticketbox.module.checkin.domain;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.UUID;

public interface CheckinLogRepository extends JpaRepository<CheckinLog, UUID> {
	
	  boolean existsByTicketId(UUID ticketId);

    Page<CheckinLog> findByConcertId(UUID concertId, Pageable pageable);

    long countByConcertId(UUID concertId);

    @Query("select count(c) from CheckinLog c where c.concertId = :concertId and c.isOffline = true")
    long countOfflineByConcertId(@Param("concertId") UUID concertId);

    @Query("select max(c.checkedAt) from CheckinLog c where c.concertId = :concertId")
    OffsetDateTime findLatestCheckedAtByConcertId(@Param("concertId") UUID concertId);
	
    @Modifying
    @Query(value = """
            INSERT INTO checkin_logs (		
                id, ticket_id, concert_id, staff_id, device_id,
                checked_at, sync_at, is_offline, gate, notes, created_at
            )
            VALUES (
                :id, :ticketId, :concertId, :staffId, :deviceId,
                :checkedAt, :syncAt, TRUE, :gate, :notes, CURRENT_TIMESTAMP
            )
            ON CONFLICT (ticket_id) DO NOTHING
            """, nativeQuery = true)
    int insertOfflineIfAbsent(
            @Param("id") UUID id,
            @Param("ticketId") UUID ticketId,
            @Param("concertId") UUID concertId,
            @Param("staffId") UUID staffId,
            @Param("deviceId") String deviceId,
            @Param("checkedAt") OffsetDateTime checkedAt,
            @Param("syncAt") OffsetDateTime syncAt,
            @Param("gate") String gate,
            @Param("notes") String notes
    );

    @Modifying
    @Query(value = "DELETE FROM checkin_logs WHERE id = :id", nativeQuery = true)
    int deleteInsertedOfflineLog(@Param("id") UUID id);
}
