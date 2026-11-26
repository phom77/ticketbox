package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.OffsetDateTime;
import java.util.UUID;

/** V21 must reproduce what the on-demand revenue query reports for orders that predate the ledger. */
@Testcontainers
class SalesLedgerBackfillTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void backfillMatchesTheCurrentRevenueQueryAndDatesRefundsByTheEventTime() {
        var datasource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(datasource).target("19").load().migrate();
        var db = new JdbcTemplate(datasource);
        UUID org = UUID.randomUUID();
        UUID concert = concert(db, org);
        UUID unattributed = concert(db, null);
        UUID type = type(db, concert), otherType = type(db, unattributed);
        OffsetDateTime paid = OffsetDateTime.parse("2026-11-01T05:00:00Z");
        OffsetDateTime refundedAt = OffsetDateTime.parse("2026-11-03T08:00:00Z");

        UUID paidOrder = order(db, concert, type, "PAID", paid, 2, 100000);
        UUID refundedOrder = order(db, concert, type, "REFUNDED", paid.plusHours(1), 1, 100000);
        db.update("INSERT INTO order_events(order_id,stream_version,event_type,payload,recorded_at) VALUES (?,2,'OrderRefunded','{}',?)",
                refundedOrder, refundedAt);
        order(db, concert, type, "EXPIRED", null, 1, 100000);
        UUID seedLike = order(db, unattributed, otherType, "PAID", paid, 3, 50000);
        // An order that predates the organization trigger still resolves through its concert.
        db.update("UPDATE orders SET organization_id = NULL WHERE id = ?", paidOrder);

        long onDemandRevenue = db.queryForObject("""
                SELECT COALESCE(SUM(oi.subtotal),0) FROM orders o JOIN order_items oi ON oi.order_id=o.id
                 WHERE o.concert_id=? AND o.status='PAID'
                """, Long.class, concert);
        long onDemandTickets = db.queryForObject("""
                SELECT COALESCE(SUM(oi.quantity),0) FROM orders o JOIN order_items oi ON oi.order_id=o.id
                 WHERE o.concert_id=? AND o.status='PAID'
                """, Long.class, concert);

        Flyway.configure().dataSource(datasource).load().migrate();

        long sold = db.queryForObject("SELECT COALESCE(SUM(quantity),0) FROM sales_ledger WHERE performance_id=? AND kind='SALE'", Long.class, concert);
        long refundedTickets = db.queryForObject("SELECT COALESCE(SUM(quantity),0) FROM sales_ledger WHERE performance_id=? AND kind='REFUND'", Long.class, concert);
        long gross = db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM sales_ledger WHERE performance_id=? AND kind='SALE'", Long.class, concert);
        long refunds = db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM sales_ledger WHERE performance_id=? AND kind='REFUND'", Long.class, concert);
        assertThat(sold - refundedTickets).isEqualTo(onDemandTickets);
        assertThat(gross - refunds).isEqualTo(onDemandRevenue);
        assertThat(refundedTickets).isEqualTo(1);

        // Sales keep their payment date, refunds the OrderRefunded event time, and unpaid orders have no rows.
        assertThat(db.queryForObject("SELECT occurred_at FROM sales_ledger WHERE order_id=? AND kind='SALE'", OffsetDateTime.class, refundedOrder).toInstant())
                .isEqualTo(paid.plusHours(1).toInstant());
        assertThat(db.queryForObject("SELECT occurred_at FROM sales_ledger WHERE order_id=? AND kind='REFUND'", OffsetDateTime.class, refundedOrder).toInstant())
                .isEqualTo(refundedAt.toInstant());
        assertThat(db.queryForObject("SELECT count(*) FROM sales_ledger WHERE performance_id=?", Integer.class, concert)).isEqualTo(3);
        // Attribution falls back to the concert's organization; unattributed concerts stay unattributed.
        assertThat(db.queryForObject("SELECT organization_id FROM sales_ledger WHERE order_id=?", UUID.class, paidOrder)).isEqualTo(org);
        assertThat(db.queryForObject("SELECT organization_id FROM sales_ledger WHERE order_id=?", UUID.class, seedLike)).isNull();
        assertThat(db.queryForObject("SELECT event_id FROM sales_ledger WHERE order_id=?", UUID.class, seedLike)).isEqualTo(unattributed);

        // Running the same backfill again adds nothing.
        int before = db.queryForObject("SELECT count(*) FROM sales_ledger", Integer.class);
        db.update("""
                INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id, offer_id,
                        offer_name, quantity, amount, occurred_at)
                SELECT o.id, oi.id, 'SALE', o.organization_id, o.concert_id, o.concert_id, oi.ticket_type_id, 'x', oi.quantity,
                       oi.subtotal, o.paid_at FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.status='PAID'
                ON CONFLICT (order_item_id, kind) DO NOTHING
                """);
        assertThat(db.queryForObject("SELECT count(*) FROM sales_ledger", Integer.class)).isEqualTo(before);
    }

    private static UUID concert(JdbcTemplate db, UUID org) {
        UUID id = UUID.randomUUID();
        db.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,sale_start_at,sale_end_at,
                    status,created_by,organization_id)
                VALUES(?, 'Backfill', 'Venue', 'Address', now()+interval '3 days', now()+interval '3 days',
                    now()-interval '1 day', now()+interval '2 days', 'ON_SALE', ?, ?)
                """, id, UUID.randomUUID(), org);
        return id;
    }

    private static UUID type(JdbcTemplate db, UUID concert) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active)"
                + " VALUES(?,?,'General',100000,10,5,4,'#123456',true)", id, concert);
        return id;
    }

    private static UUID order(JdbcTemplate db, UUID concert, UUID type, String status, OffsetDateTime paidAt, int quantity, long price) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key,paid_at,payment_provider,payment_ref)"
                + " VALUES(?,?,?,?,?,?,?,?,?)", id, UUID.randomUUID(), concert, status, quantity * price,
                UUID.randomUUID().toString(), paidAt, paidAt == null ? null : "MOCK", paidAt == null ? null : "pay-" + id);
        db.update("INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, type, quantity, price, quantity * price);
        return id;
    }
}
