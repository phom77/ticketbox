package com.ticketbox.module.ticket.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface OrderItemRepository extends JpaRepository<OrderItem, UUID> {
    List<OrderItem> findByOrderId(UUID orderId);
    List<OrderItem> findByOrderIdIn(List<UUID> orderIds);

    @Query("""
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
            @Param("statuses") Collection<Order.Status> statuses
    );
}
