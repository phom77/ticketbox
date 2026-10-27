package com.ticketbox.module.concert;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ConcertReportingPort {

    Optional<ConcertReportingView> findOwnedConcert(UUID concertId, UUID organizerId);

    Optional<ConcertReportingView> findConcert(UUID concertId);

    List<UUID> findConcertIdsOwnedBy(UUID organizerId);

    Page<ConcertReportingView> findCompletedConcerts(UUID organizerId, Pageable pageable);

    List<TicketTypeReportingView> findTicketTypes(UUID concertId);
}
