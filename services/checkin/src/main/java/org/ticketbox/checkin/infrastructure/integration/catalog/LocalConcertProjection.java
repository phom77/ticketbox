package org.ticketbox.checkin.infrastructure.integration.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.ticketbox.checkin.application.port.catalog.CheckinConcertView;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
public class LocalConcertProjection
        implements org.ticketbox.checkin.admission.application.port.ConcertAccess {
    private static final String METADATA =
            "id, title, venue_name, venue_address, event_date, doors_open_at, status, poster_url";
    private static final RowMapper<CheckinConcertView> ROW =
            (rs, index) ->
                    new CheckinConcertView(
                            rs.getObject("id", UUID.class),
                            rs.getString("title"),
                            rs.getString("venue_name"),
                            rs.getString("venue_address"),
                            rs.getObject("event_date", OffsetDateTime.class),
                            rs.getObject("doors_open_at", OffsetDateTime.class),
                            rs.getString("status"),
                            rs.getString("poster_url"));

    private final JdbcTemplate jdbc;

    public LocalConcertProjection(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<CheckinConcertView> findById(UUID concertId) {
        return jdbc
                .query("SELECT " + METADATA + " FROM concerts WHERE id=?", ROW, concertId)
                .stream()
                .findFirst();
    }

    public Page<CheckinConcertView> findByStatusOrderByEventDate(String status, Pageable pageable) {
        var rows =
                jdbc.query(
                        "SELECT "
                                + METADATA
                                + " FROM concerts WHERE status=? ORDER BY event_date,id LIMIT ?"
                                + " OFFSET ?",
                        ROW,
                        status,
                        pageable.getPageSize(),
                        pageable.getOffset());
        long total =
                jdbc.queryForObject(
                        "SELECT count(*) FROM concerts WHERE status=?", Long.class, status);
        return new PageImpl<>(rows, pageable, total);
    }

    public boolean exists(UUID concertId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM concerts WHERE id=?)",
                        Boolean.class,
                        concertId));
    }

    public boolean isOwnedBy(UUID concertId, UUID organizerId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM concerts WHERE id=? AND organization_id=?)",
                        Boolean.class,
                        concertId,
                        organizerId));
    }

    public List<UUID> findConcertIdsOwnedBy(UUID organizerId) {
        return jdbc.queryForList(
                "SELECT id FROM concerts WHERE organization_id=?", UUID.class, organizerId);
    }
}
