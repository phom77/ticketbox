package org.ticketbox.ticketing.inventory.hold.application.port;

import org.ticketbox.ticketing.inventory.hold.domain.TicketHold;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TicketHoldRepository {
    Optional<TicketHold> findByUserIdAndConcertIdAndTicketTypeId(
            UUID userId, UUID concertId, UUID ticketTypeId);

    List<TicketHold> findByUserIdAndConcertId(UUID userId, UUID concertId);

    List<Object[]> expiredOwners();

    List<TicketHold> findByExpiresAtBefore(OffsetDateTime time);

    void deleteByUserIdAndConcertId(UUID userId, UUID concertId);

    <S extends TicketHold> S save(S entity);

    <S extends TicketHold> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<TicketHold> findById(java.util.UUID id);

    void delete(TicketHold entity);

    void deleteById(java.util.UUID id);

    void flush();

    <S extends TicketHold> S saveAndFlush(S hold);
}
