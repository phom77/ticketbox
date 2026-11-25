package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.application.port.DisruptionOptionsStore;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcDisruptionOptionsStore implements DisruptionOptionsStore {
    private static final String SELECT = """
            SELECT DISTINCT ON (d.concert_id) d.concert_id, c.title, d.kind,
                CASE WHEN d.kind = 'POSTPONE' THEN COALESCE(d.event_date, c.event_date) END AS new_date
            FROM event_disruptions d JOIN concerts c ON c.id = d.concert_id
            WHERE d.concert_id IN (SELECT o.concert_id FROM orders o WHERE o.user_id = ? AND o.status IN ('PAID', 'REFUNDED'))
            """;
    private static final RowMapper<Disruption> DISRUPTIONS = (rs, n) -> new Disruption(rs.getObject("concert_id", UUID.class),
            rs.getString("title"), rs.getString("kind"), rs.getObject("new_date", OffsetDateTime.class));

    private final JdbcTemplate jdbc;

    JdbcDisruptionOptionsStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Disruption> forBuyer(UUID buyerId) {
        return jdbc.query(SELECT + " ORDER BY d.concert_id, d.cutoff_at DESC, d.id", DISRUPTIONS, buyerId);
    }

    @Override
    public Optional<Disruption> find(UUID buyerId, UUID concertId) {
        return jdbc.query(SELECT + " AND d.concert_id = ? ORDER BY d.concert_id, d.cutoff_at DESC, d.id", DISRUPTIONS,
                buyerId, concertId).stream().findFirst();
    }

    @Override
    public List<OrderRow> orders(UUID buyerId, UUID concertId) {
        return jdbc.query("""
                SELECT o.id, o.reference_code, o.total_amount, o.status, f.state
                FROM orders o LEFT JOIN order_refunds f ON f.order_id = o.id
                WHERE o.user_id = ? AND o.concert_id = ? AND o.status IN ('PAID', 'REFUNDED')
                ORDER BY o.created_at, o.id
                """, (rs, n) -> new OrderRow(rs.getObject("id", UUID.class), rs.getString("reference_code"),
                rs.getBigDecimal("total_amount"), rs.getString("status"), rs.getString("state")), buyerId, concertId);
    }
}
