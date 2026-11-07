package org.ticketbox.checkin.admission.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.checkin.application.port.catalog.CheckinConcertView;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConcertAccess {
    Optional<CheckinConcertView> findById(UUID concertId);

    Page<CheckinConcertView> findByStatusOrderByEventDate(String status, Pageable pageable);

    boolean exists(UUID concertId);

    boolean isOwnedBy(UUID concertId, UUID organizerId);

    List<UUID> findConcertIdsOwnedBy(UUID organizerId);
}
