package com.ticketbox.module.ticket.domain;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {
    @Query(value="SELECT id FROM orders WHERE status='AWAITING_PAYMENT' AND expires_at<=now() ORDER BY expires_at,id LIMIT 100",nativeQuery=true)
    List<UUID> expiredOrderIds();
    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);
    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select o
            from Order o
            where o.status = :status
              and o.expiresAt <= :now
            order by o.expiresAt asc
            """)
    List<Order> findExpiredAwaitingPaymentOrders(
            @Param("status") Order.Status status,
            @Param("now") OffsetDateTime now,
            Pageable pageable
    );

    Optional<Order> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<Order> findAllByOrderByCreatedAtDesc();

    List<Order> findByConcertIdOrderByCreatedAtDesc(UUID concertId);

    List<Order> findByConcertIdInOrderByCreatedAtDesc(Collection<UUID> concertIds);

    @Query("SELECT o FROM Order o WHERE o.status = :status ORDER BY o.createdAt DESC")
    List<Order> findByStatusOrderByCreatedAtDesc(@Param("status") Order.Status status);

    @Query("""
            SELECT o FROM Order o
            WHERE o.concertId IN :concertIds
              AND o.status = :status
            ORDER BY o.createdAt DESC
            """)
    List<Order> findByConcertIdInAndStatusOrderByCreatedAtDesc(
            @Param("concertIds") Collection<UUID> concertIds,
            @Param("status") Order.Status status);
}
