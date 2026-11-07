package org.ticketbox.ticketing.order.application.port;

import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface OrderItemRepository {
    List<OrderItem> findByOrderId(UUID orderId);

    List<OrderItem> findByOrderIdIn(List<UUID> orderIds);

    int sumQuantityByUserIdAndTicketTypeId(
            UUID userId, UUID ticketTypeId, Collection<Order.Status> statuses);

    <S extends OrderItem> S save(S entity);

    <S extends OrderItem> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<OrderItem> findById(java.util.UUID id);

    void delete(OrderItem entity);

    void deleteById(java.util.UUID id);

    void flush();

    java.util.List<OrderItem> findAll();
}
