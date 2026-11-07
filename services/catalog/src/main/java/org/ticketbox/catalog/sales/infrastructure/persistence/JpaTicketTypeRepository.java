package org.ticketbox.catalog.sales.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.sales.domain.TicketType;

import java.util.List;
import java.util.UUID;

@Repository
public interface JpaTicketTypeRepository
        extends org.ticketbox.catalog.sales.application.port.TicketTypeRepository,
                JpaRepository<TicketType, UUID> {
    boolean existsByConcertId(UUID concertId);

    @Query(
            """
            select ticketType
            from TicketType ticketType
            where ticketType.concertId = :concertId
              and ticketType.isActive = true
            order by ticketType.price asc
            """)
    List<TicketType> findActiveByConcertIdOrderByPrice(@Param("concertId") UUID concertId);

    void deleteByConcertId(UUID concertId);

    List<TicketType> findByConcertId(UUID concertId);

    List<TicketType> findByConcertIdAndIsActiveTrue(UUID concertId);
}
