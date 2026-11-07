package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface JpaOrderItemRepository
        extends org.ticketbox.ticketing.order.application.port.OrderItemRepository,
                JpaRepository<OrderItem, UUID> {
    List<OrderItem> findByOrderId(UUID orderId);

    List<OrderItem> findByOrderIdIn(List<UUID> orderIds);

    @Query(
            """
            select coalesce(sum(oi.quantity), 0)
            from OrderItem oi
            join Order o on oi.orderId = o.id
            where o.userId = :userId
              and oi.ticketTypeId = :ticketTypeId
              and o.status in :statuses
            """)
    int sumQuantityByUserIdAndTicketTypeId(
            @Param("userId") UUID userId,
            @Param("ticketTypeId") UUID ticketTypeId,
            @Param("statuses") Collection<Order.Status> statuses);
}
