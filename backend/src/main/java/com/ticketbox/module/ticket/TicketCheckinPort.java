package com.ticketbox.module.ticket;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface TicketCheckinPort {
    Optional<TicketView> findByQrCode(String qrCode);
    List<TicketView> findByConcertIdAndStatusValid(UUID concertId);
    Page<TicketView> findByConcertId(UUID concertId, String query, String status, Pageable pageable);
    Map<UUID, TicketView> findByIds(List<UUID> ticketIds);
    TicketCheckinStats getStats(UUID concertId);
    void markAsUsed(UUID ticketId, OffsetDateTime usedAt);
    boolean markAsUsedIfValid(UUID ticketId, OffsetDateTime usedAt);
}
