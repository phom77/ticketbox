package org.ticketbox.ticketing.issuance.infrastructure;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces;

@Repository
class JdbcTicketPlaces implements TicketPlaces {
    private final NamedParameterJdbcTemplate jdbc;

    JdbcTicketPlaces(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<UUID, Place> forTickets(List<UUID> ticketIds) {
        if (ticketIds.isEmpty()) return Map.of();
        Map<UUID, Place> result = new HashMap<>();
        jdbc.query("""
                SELECT t.id, o.concert_id, o.performance_event_id, o.performance_title,
                    o.performance_venue_name, o.performance_starts_at, i.offer_name, i.section_label,
                    i.row_label, i.seat_label
                FROM tickets t JOIN order_items i ON i.id=t.order_item_id JOIN orders o ON o.id=i.order_id
                WHERE t.id IN (:ids) AND o.performance_event_id IS NOT NULL
                """, Map.of("ids", ticketIds), (RowCallbackHandler) row -> result.put(row.getObject("id", UUID.class),
                new Place(row.getObject("concert_id", UUID.class), row.getObject("performance_event_id", UUID.class),
                        row.getString("performance_title"), row.getString("performance_venue_name"),
                        row.getObject("performance_starts_at", OffsetDateTime.class), row.getString("offer_name"),
                        row.getString("section_label"), row.getString("row_label"), row.getString("seat_label"))));
        return result;
    }
}
