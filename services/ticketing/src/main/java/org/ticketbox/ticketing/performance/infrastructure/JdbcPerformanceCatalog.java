package org.ticketbox.ticketing.performance.infrastructure;

import java.sql.SQLException;
import java.util.HashSet;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.performance.application.port.PerformanceCatalog;
import org.ticketbox.ticketing.performance.domain.PerformanceSale;

@Repository
class JdbcPerformanceCatalog implements PerformanceCatalog {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    JdbcPerformanceCatalog(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    @Transactional
    public long apply(PerformanceSale sale) {
        lockPublisher(sale.id());
        var previous = jdbc.query(
                "SELECT source_payload::text FROM performance_sales WHERE id=?",
                (row, n) -> decode(row.getString(1)), sale.id()).stream().findFirst().orElse(null);
        if (previous != null) {
            if (previous.version() >= sale.version()) {
                if (previous.version() == sale.version() && !encode(previous).equals(encode(sale))) {
                    throw new IllegalStateException("Conflicting performance version");
                }
                return previous.version();
            }
            if (!sameLayout(previous, sale)) {
                throw new IllegalStateException("An activated performance layout cannot be replaced");
            }
        } else {
            activate(sale);
        }

        jdbc.update("""
                UPDATE concerts SET title=?, venue_name=?, event_date=?, doors_open_at=?, sale_start_at=?,
                    sale_end_at=?, status=?, sales_suspended=?, is_public=?, updated_at=clock_timestamp()
                WHERE id=?
                """, sale.title(), sale.venueName(), sale.startsAt(), sale.doorsOpenAt(), sale.saleStartAt(),
                sale.saleEndAt(), sale.status(), sale.salesSuspended(), sale.publicVisible(), sale.id());

        jdbc.update("""
                INSERT INTO performance_sales(id,event_id,source_version,layout_version,layout_checksum,
                  ends_at,timezone,max_per_account,source_payload)
                VALUES (?,?,?,?,?,?,?,?,CAST(? AS jsonb))
                ON CONFLICT(id) DO UPDATE SET source_version=EXCLUDED.source_version,
                  ends_at=EXCLUDED.ends_at,timezone=EXCLUDED.timezone,max_per_account=EXCLUDED.max_per_account,
                  source_payload=EXCLUDED.source_payload
                """, sale.id(), sale.eventId(), sale.version(), sale.layoutVersion(), sale.layoutChecksum(),
                sale.endsAt(), sale.timezone(), sale.maxPerAccount(), encode(sale));

        if (previous == null) {
            for (var group : sale.groups()) insertGroup(sale.id(), group);
        }
        var groupCapacity = sale.groups().stream().collect(Collectors.toMap(
                PerformanceSale.Group::id, PerformanceSale.Group::capacity));
        var retained = new HashSet<UUID>();
        for (var offer : sale.offers()) {
            upsertOffer(sale, offer, groupCapacity.get(offer.groupId()));
            retained.add(offer.id());
        }
        for (UUID id : jdbc.queryForList("SELECT id FROM performance_offers WHERE performance_id=?",
                UUID.class, sale.id())) {
            if (!retained.contains(id)) jdbc.update("UPDATE ticket_types SET is_active=false WHERE id=?", id);
        }
        return sale.version();
    }

    private void activate(PerformanceSale sale) {
        if (sale.legacyConcertId() != null) {
            if (sale.id().equals(sale.legacyConcertId())) {
                throw new IllegalStateException("Performance and legacy IDs must be distinct");
            }
            lockPublisher(sale.legacyConcertId());
            int claimed = jdbc.update("""
                    UPDATE concerts SET sales_mode='V2'
                    WHERE id=? AND status='DRAFT' AND sales_mode='V1' AND organization_id=?
                      AND NOT EXISTS (SELECT 1 FROM orders WHERE concert_id=concerts.id)
                      AND NOT EXISTS (SELECT 1 FROM ticket_holds WHERE concert_id=concerts.id)
                      AND NOT EXISTS (SELECT 1 FROM tickets WHERE concert_id=concerts.id)
                    """, sale.legacyConcertId(), sale.organizationId());
            if (claimed != 1) throw new IllegalStateException("Legacy concert is ineligible for activation");
        }
        int inserted = jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                  sale_start_at,sale_end_at,status,created_by,organization_id,is_public,sales_suspended,sales_mode)
                VALUES(?,?,?,'',?,?,?,?,?,?,?,?,?,'V2') ON CONFLICT DO NOTHING
                """, sale.id(), sale.title(), sale.venueName(), sale.startsAt(), sale.doorsOpenAt(),
                sale.saleStartAt(), sale.saleEndAt(), sale.status(), sale.organizationId(),
                sale.organizationId(), sale.publicVisible(), sale.salesSuspended());
        if (inserted != 1) throw new IllegalStateException("Performance ID collides with an existing concert");
    }

    private void insertGroup(UUID id, PerformanceSale.Group group) {
        jdbc.update("""
                INSERT INTO performance_groups(performance_id,id,section_id,section_label,kind,capacity,available)
                VALUES(?,?,?,?,?,?,?)
                """, id, group.id(), group.sectionId(), group.sectionLabel(), group.kind().name(),
                group.capacity(), group.kind() == PerformanceSale.Kind.GA ? group.capacity() : 0);
        jdbc.batchUpdate("""
                INSERT INTO performance_seats(performance_id,id,group_id,row_label,seat_label,status)
                VALUES(?,?,?,?,?,?)
                """, group.seats(), 500, (statement, seat) -> {
            statement.setObject(1, id);
            statement.setObject(2, seat.id());
            statement.setObject(3, group.id());
            statement.setString(4, seat.rowLabel());
            statement.setString(5, seat.seatLabel());
            statement.setString(6, seat.blocked() ? "BLOCKED" : "AVAILABLE");
        });
    }

    private void upsertOffer(PerformanceSale sale, PerformanceSale.Offer offer, int capacity) {
        int projected = jdbc.update("""
                INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,
                  is_active,performance_offer)
                VALUES(?,?,?,?,?,0,?,?,true)
                ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price,
                  is_active=EXCLUDED.is_active,max_per_account=EXCLUDED.max_per_account,
                  updated_at=clock_timestamp()
                WHERE ticket_types.concert_id=EXCLUDED.concert_id AND ticket_types.performance_offer
                """, offer.id(), sale.id(), offer.name(), offer.price(), capacity,
                sale.maxPerAccount(), offer.active());
        int configured = jdbc.update("""
                INSERT INTO performance_offers(id,performance_id,group_id,sale_start_at,sale_end_at,
                  description,min_per_order)
                VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET sale_start_at=EXCLUDED.sale_start_at,sale_end_at=EXCLUDED.sale_end_at,
                  description=EXCLUDED.description,min_per_order=EXCLUDED.min_per_order
                WHERE performance_offers.performance_id=EXCLUDED.performance_id
                  AND performance_offers.group_id=EXCLUDED.group_id
                """, offer.id(), sale.id(), offer.groupId(), offer.saleStartAt(), offer.saleEndAt(),
                offer.description(), offer.minPerOrder());
        if (projected != 1 || configured != 1) {
            throw new IllegalStateException("Conflicting performance offer identity");
        }
    }

    private boolean sameLayout(PerformanceSale previous, PerformanceSale next) {
        return Objects.equals(previous.layoutVersion(), next.layoutVersion())
                && Objects.equals(previous.layoutChecksum(), next.layoutChecksum())
                && previous.eventId().equals(next.eventId())
                && previous.organizationId().equals(next.organizationId())
                && Objects.equals(previous.legacyConcertId(), next.legacyConcertId())
                && new HashSet<>(previous.groups()).equals(new HashSet<>(next.groups()));
    }

    private void lockPublisher(UUID id) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0)) IS NULL",
                Boolean.class, "catalog:" + id);
    }

    @Override
    public boolean usesPerformanceStock(UUID performanceId) {
        return jdbc.query("SELECT sales_mode='V2' FROM concerts WHERE id=? FOR SHARE",
                (row, n) -> row.getBoolean(1), performanceId).stream().findFirst().orElse(false);
    }

    private String encode(PerformanceSale sale) {
        try {
            return json.writeValueAsString(sale);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid performance source payload", failure);
        }
    }

    private PerformanceSale decode(String value) throws SQLException {
        try {
            return json.readValue(value, PerformanceSale.class);
        } catch (JsonProcessingException failure) {
            throw new SQLException("Invalid persisted performance source", failure);
        }
    }
}
