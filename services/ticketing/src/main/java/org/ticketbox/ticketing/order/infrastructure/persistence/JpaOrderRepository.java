package org.ticketbox.ticketing.order.infrastructure.persistence;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.domain.Order;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface JpaOrderRepository
        extends org.ticketbox.ticketing.order.application.port.OrderRepository,
                JpaRepository<Order, UUID> {
    String SUPPORT_FILTER = """
            FROM orders o
            WHERE (CAST(:organizationId AS uuid) IS NULL OR o.organization_id = :organizationId)
              AND (CAST(:concertId AS uuid) IS NULL OR o.concert_id = :concertId)
              AND (CAST(:orderId AS uuid) IS NULL OR o.id = :orderId)
              AND (CAST(:buyerId AS uuid) IS NULL OR o.user_id = :buyerId)
              AND (CAST(:transactionRef AS text) IS NULL OR EXISTS (
                  SELECT 1 FROM payment_reconciliation p JOIN ticketing_payment_intents i
                    ON p.intent_id = i.intent_id AND p.order_id = i.order_id AND p.provider = i.provider
                    AND p.requested_amount = i.amount
                  WHERE i.order_id = o.id AND p.transaction_id = :transactionRef
              ))
            """;

    @Override
    @Query(value = "SELECT o.* " + SUPPORT_FILTER + " ORDER BY o.created_at DESC, o.id",
            countQuery = "SELECT count(*) " + SUPPORT_FILTER, nativeQuery = true)
    org.springframework.data.domain.Page<Order> searchSupport(UUID organizationId, UUID concertId,
            UUID orderId, UUID buyerId, String transactionRef, Pageable pageable);

    @Query(
            value =
                    "SELECT id FROM orders WHERE status='AWAITING_PAYMENT' AND expires_at<=now()"
                            + " ORDER BY expires_at,id LIMIT 100",
            nativeQuery = true)
    List<UUID> expiredOrderIds();

    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            """
            select o
            from Order o
            where o.status = :status
              and o.expiresAt <= :now
            order by o.expiresAt asc
            """)
    List<Order> findExpiredAwaitingPaymentOrders(
            @Param("status") Order.Status status,
            @Param("now") OffsetDateTime now,
            Pageable pageable);

    Optional<Order> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<Order> findAllByOrderByCreatedAtDesc();

    List<Order> findByConcertIdOrderByCreatedAtDesc(UUID concertId);

    List<Order> findByConcertIdInOrderByCreatedAtDesc(Collection<UUID> concertIds);

    @Query("SELECT o FROM Order o WHERE o.status = :status ORDER BY o.createdAt DESC")
    List<Order> findByStatusOrderByCreatedAtDesc(@Param("status") Order.Status status);

    @Query(
            """
            SELECT o FROM Order o
            WHERE o.concertId IN :concertIds
              AND o.status = :status
            ORDER BY o.createdAt DESC
            """)
    List<Order> findByConcertIdInAndStatusOrderByCreatedAtDesc(
            @Param("concertIds") Collection<UUID> concertIds, @Param("status") Order.Status status);
}
