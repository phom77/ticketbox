package org.ticketbox.ticketing.order.application.port;

import org.springframework.data.domain.Pageable;
import org.ticketbox.ticketing.order.domain.Order;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository {

    List<UUID> expiredOrderIds();

    org.springframework.data.domain.Page<Order> searchSupport(UUID organizationId, UUID concertId,
            UUID orderId, UUID buyerId, String transactionRef, Pageable pageable);

    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    Optional<Order> findByIdForUpdate(UUID id);

    List<Order> findExpiredAwaitingPaymentOrders(
            Order.Status status, OffsetDateTime now, Pageable pageable);

    Optional<Order> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<Order> findAllByOrderByCreatedAtDesc();

    List<Order> findByConcertIdOrderByCreatedAtDesc(UUID concertId);

    List<Order> findByConcertIdInOrderByCreatedAtDesc(Collection<UUID> concertIds);

    List<Order> findByStatusOrderByCreatedAtDesc(Order.Status status);

    List<Order> findByConcertIdInAndStatusOrderByCreatedAtDesc(
            Collection<UUID> concertIds, Order.Status status);

    <S extends Order> S save(S entity);

    <S extends Order> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<Order> findById(java.util.UUID id);

    void delete(Order entity);

    void deleteById(java.util.UUID id);

    void flush();
}
