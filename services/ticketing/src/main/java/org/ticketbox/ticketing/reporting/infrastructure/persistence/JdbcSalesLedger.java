package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.reporting.application.port.SalesLedger;

import java.time.OffsetDateTime;
import java.util.UUID;

@Repository
public class JdbcSalesLedger implements SalesLedger {
    private static final String INSERT = """
            INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id,
                    offer_id, group_id, offer_name, section_label, quantity, amount, provider, occurred_at)
            SELECT o.id, oi.id, ?, COALESCE(o.organization_id, c.organization_id),
                   COALESCE(o.performance_event_id, o.concert_id), o.concert_id, oi.ticket_type_id, oi.group_id,
                   COALESCE(oi.offer_name, tt.name, ''), COALESCE(oi.section_label, tt.name), oi.quantity,
                   oi.subtotal, ?, ?
              FROM orders o
              JOIN order_items oi ON oi.order_id = o.id
              JOIN concerts c ON c.id = o.concert_id
              LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
             WHERE o.id = ?
            ON CONFLICT (order_item_id, kind) DO NOTHING
            """;

    private final JdbcTemplate db;

    public JdbcSalesLedger(JdbcTemplate db) {
        this.db = db;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordSale(UUID orderId, String provider, OffsetDateTime paidAt) {
        db.update(INSERT, "SALE", provider, paidAt, orderId);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordRefund(UUID orderId, String provider, OffsetDateTime confirmedAt) {
        db.update(INSERT, "REFUND", provider, confirmedAt, orderId);
    }
}
