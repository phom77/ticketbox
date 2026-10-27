package com.ticketbox.module.ticket.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface TicketSalesReportingRepository extends Repository<Order, UUID> {

    @Query(value = """
            SELECT
                COALESCE(SUM(oi.subtotal), 0) AS totalRevenue,
                COALESCE(SUM(oi.quantity), 0) AS totalTicketsSold
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.concert_id = :concertId
              AND o.status = 'PAID'
            """, nativeQuery = true)
    RevenueSummaryProjection findRevenueSummary(@Param("concertId") UUID concertId);

    @Query(value = """
            SELECT
                oi.ticket_type_id AS ticketTypeId,
                COALESCE(SUM(oi.quantity), 0) AS soldQuantity,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.concert_id = :concertId
              AND o.status = 'PAID'
            GROUP BY oi.ticket_type_id
            ORDER BY oi.ticket_type_id
            """, nativeQuery = true)
    List<ZoneRevenueProjection> findZoneRevenue(@Param("concertId") UUID concertId);

    @Query(value = """
            SELECT
                TO_CHAR(
                    DATE(o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                    'YYYY-MM-DD'
                ) AS date,
                COALESCE(SUM(oi.quantity), 0) AS ticketsSold,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.concert_id = :concertId
              AND o.status = 'PAID'
              AND o.paid_at >= :startDate
              AND o.paid_at < :endDate
            GROUP BY DATE(o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
            ORDER BY DATE(o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
            """, nativeQuery = true)
    List<SalesTrendProjection> findDailySalesTrend(
            @Param("concertId") UUID concertId,
            @Param("startDate") OffsetDateTime startDate,
            @Param("endDate") OffsetDateTime endDate);

    interface RevenueSummaryProjection {
        BigDecimal getTotalRevenue();

        Long getTotalTicketsSold();
    }

    interface ZoneRevenueProjection {
        UUID getTicketTypeId();

        Long getSoldQuantity();

        BigDecimal getRevenue();
    }

    interface SalesTrendProjection {
        String getDate();

        Long getTicketsSold();

        BigDecimal getRevenue();
    }
}
