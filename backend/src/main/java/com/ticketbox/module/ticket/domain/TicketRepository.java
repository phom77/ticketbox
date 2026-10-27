package com.ticketbox.module.ticket.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {
    Optional<Ticket> findByQrCode(String qrCode);
    List<Ticket> findByConcertIdAndStatus(UUID concertId, Ticket.Status status);
    Page<Ticket> findByConcertId(UUID concertId, Pageable pageable);
    Page<Ticket> findByConcertIdAndStatus(UUID concertId, Ticket.Status status, Pageable pageable);
    Page<Ticket> findByConcertIdAndQrCodeContainingIgnoreCase(UUID concertId, String qrCode, Pageable pageable);
    Page<Ticket> findByConcertIdAndStatusAndQrCodeContainingIgnoreCase(
            UUID concertId,
            Ticket.Status status,
            String qrCode,
            Pageable pageable
    );
    long countByConcertId(UUID concertId);
    long countByConcertIdAndStatus(UUID concertId, Ticket.Status status);

    @Query("SELECT MAX(t.updatedAt) FROM Ticket t WHERE t.concertId = :concertId")
    Optional<OffsetDateTime> findLatestUpdatedAtByConcertId(@Param("concertId") UUID concertId);

    List<Ticket> findByUserIdOrderByIssuedAtDesc(UUID userId);
    Optional<Ticket> findByIdAndUserId(UUID id, UUID userId);

    @Query("""
            SELECT t FROM Ticket t
             WHERE t.orderItemId IN (
                 SELECT oi.id FROM OrderItem oi WHERE oi.orderId = :orderId
             )
             ORDER BY t.issuedAt ASC
            """)
    List<Ticket> findByOrderId(@Param("orderId") UUID orderId);

    @Modifying
    @Query("UPDATE Ticket t SET t.status = 'USED', t.usedAt = :usedAt WHERE t.id = :id AND t.status = 'VALID'")
    int markAsUsedIfValid(@Param("id") UUID id, @Param("usedAt") OffsetDateTime usedAt);

    @Query("SELECT DISTINCT t.userId FROM Ticket t WHERE t.concertId = :concertId AND t.status = 'VALID'")
    List<UUID> findDistinctUserIdsByConcertId(@Param("concertId") UUID concertId);
}
