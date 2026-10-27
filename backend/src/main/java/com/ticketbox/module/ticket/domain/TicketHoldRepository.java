package com.ticketbox.module.ticket.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TicketHoldRepository extends JpaRepository<TicketHold, UUID> {
    Optional<TicketHold> findByUserIdAndConcertIdAndTicketTypeId(UUID userId, UUID concertId, UUID ticketTypeId);
    List<TicketHold> findByUserIdAndConcertId(UUID userId, UUID concertId);
    @org.springframework.data.jpa.repository.Query(value = """
        SELECT DISTINCT user_id,concert_id FROM ticket_holds WHERE expires_at <= now()
        ORDER BY user_id,concert_id LIMIT 100
        """,nativeQuery = true)
    List<Object[]> expiredOwners();
    List<TicketHold> findByExpiresAtBefore(OffsetDateTime time);
    void deleteByUserIdAndConcertId(UUID userId, UUID concertId);
}
