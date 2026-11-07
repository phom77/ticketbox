package org.ticketbox.checkin.admission.infrastructure;

import org.springframework.data.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.ticketbox.checkin.admission.application.port.TicketCheckinPort;
import org.ticketbox.checkin.admission.application.port.TicketCheckinStats;
import org.ticketbox.checkin.admission.application.port.TicketView;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;

@Component
public class LocalTickets implements TicketCheckinPort {
    private final JdbcTemplate jdbc;

    public LocalTickets(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private TicketView row(ResultSet rs, int index) throws SQLException {
        return new TicketView(
                rs.getObject("id", UUID.class),
                rs.getObject("concert_id", UUID.class),
                rs.getObject("ticket_type_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("qr_code"),
                rs.getString("qr_secret"),
                rs.getString("status"),
                rs.getObject("issued_at", OffsetDateTime.class),
                rs.getObject("used_at", OffsetDateTime.class));
    }

    public Optional<TicketView> findByQrCode(String qr) {
        return jdbc.query("SELECT * FROM tickets WHERE qr_code=?", this::row, qr).stream()
                .findFirst();
    }

    public List<TicketView> findByConcertIdAndStatusValid(UUID concert) {
        return jdbc.query(
                "SELECT * FROM tickets WHERE concert_id=? AND status='VALID' ORDER BY id",
                this::row,
                concert);
    }

    public Page<TicketView> findByConcertId(
            UUID concert, String query, String status, Pageable page) {
        String filter =
                " FROM tickets WHERE concert_id=? AND (?='' OR status=?) AND (?='' OR qr_code ILIKE"
                        + " ?)";
        String search = query == null ? "" : query.trim();
        String state = status == null ? "" : status;
        List<TicketView> rows =
                jdbc.query(
                        "SELECT *" + filter + " ORDER BY issued_at,id LIMIT ? OFFSET ?",
                        this::row,
                        concert,
                        state,
                        state,
                        search,
                        "%" + search + "%",
                        page.getPageSize(),
                        page.getOffset());
        long total =
                jdbc.queryForObject(
                        "SELECT count(*)" + filter,
                        Long.class,
                        concert,
                        state,
                        state,
                        search,
                        "%" + search + "%");
        return new PageImpl<>(rows, page, total);
    }

    public Map<UUID, TicketView> findByIds(List<UUID> ids) {
        Map<UUID, TicketView> result = new HashMap<>();
        for (UUID id : new HashSet<>(ids)) {
            jdbc.query("SELECT * FROM tickets WHERE id=?", this::row, id)
                    .forEach(ticket -> result.put(ticket.id(), ticket));
        }
        return result;
    }

    public TicketCheckinStats getStats(UUID concert) {
        return jdbc.queryForObject(
                """
SELECT count(*),count(*) FILTER(WHERE status='VALID'),count(*) FILTER(WHERE status='USED'),
    count(*) FILTER(WHERE status='CANCELLED'),count(*) FILTER(WHERE status='TRANSFERRED'),max(updated_at)
FROM tickets WHERE concert_id=?
""",
                (rs, index) ->
                        new TicketCheckinStats(
                                rs.getLong(1),
                                rs.getLong(2),
                                rs.getLong(3),
                                rs.getLong(4),
                                rs.getLong(5),
                                rs.getObject(6, OffsetDateTime.class)),
                concert);
    }

    public boolean markAsUsedIfValid(UUID id, OffsetDateTime time) {
        return jdbc.update(
                        "UPDATE tickets SET status='USED',used_at=?,updated_at=now() WHERE id=? AND"
                                + " status='VALID'",
                        time,
                        id)
                == 1;
    }
}
