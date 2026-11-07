package org.ticketbox.ticketing.issuance.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.ticketing.issuance.domain.Ticket;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TicketRepository {
    Optional<Ticket> findByQrCode(String qrCode);

    List<Ticket> findByConcertIdAndStatus(UUID concertId, Ticket.Status status);

    Page<Ticket> findByConcertId(UUID concertId, Pageable pageable);

    Page<Ticket> findByConcertIdAndStatus(UUID concertId, Ticket.Status status, Pageable pageable);

    Page<Ticket> findByConcertIdAndQrCodeContainingIgnoreCase(
            UUID concertId, String qrCode, Pageable pageable);

    Page<Ticket> findByConcertIdAndStatusAndQrCodeContainingIgnoreCase(
            UUID concertId, Ticket.Status status, String qrCode, Pageable pageable);

    long countByConcertId(UUID concertId);

    long countByConcertIdAndStatus(UUID concertId, Ticket.Status status);

    Optional<OffsetDateTime> findLatestUpdatedAtByConcertId(UUID concertId);

    List<Ticket> findByUserIdOrderByIssuedAtDesc(UUID userId);

    Optional<Ticket> findByIdAndUserId(UUID id, UUID userId);

    List<Ticket> findByOrderId(UUID orderId);

    int markAsUsedIfValid(UUID id, OffsetDateTime usedAt);

    List<UUID> findDistinctUserIdsByConcertId(UUID concertId);

    <S extends Ticket> S save(S entity);

    <S extends Ticket> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<Ticket> findById(java.util.UUID id);

    void delete(Ticket entity);

    void deleteById(java.util.UUID id);

    void flush();
}
