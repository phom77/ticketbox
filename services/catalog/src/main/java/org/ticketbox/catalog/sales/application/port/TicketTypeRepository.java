package org.ticketbox.catalog.sales.application.port;

import org.ticketbox.catalog.sales.domain.TicketType;

import java.util.List;
import java.util.UUID;

public interface TicketTypeRepository {
    boolean existsByConcertId(UUID concertId);

    List<TicketType> findActiveByConcertIdOrderByPrice(UUID concertId);

    void deleteByConcertId(UUID concertId);

    List<TicketType> findByConcertId(UUID concertId);

    List<TicketType> findByConcertIdAndIsActiveTrue(UUID concertId);

    <S extends TicketType> S save(S entity);

    <S extends TicketType> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<TicketType> findById(java.util.UUID id);

    void delete(TicketType entity);

    void deleteById(java.util.UUID id);

    void flush();

    <S extends TicketType> S saveAndFlush(S type);
}
