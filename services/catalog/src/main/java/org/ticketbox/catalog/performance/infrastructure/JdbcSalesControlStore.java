package org.ticketbox.catalog.performance.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.performance.application.SalesControlStore;

@Repository
public class JdbcSalesControlStore implements SalesControlStore {
    private static final String PAUSES = """
            SELECT s.*, p.ticketing_ack FROM performance_sales_pauses s
            JOIN performance_sale_publications p ON p.performance_id=s.performance_id
              AND p.version=COALESCE(s.resume_version,s.pause_version)
            """;
    private static final String QUEUE = """
            SELECT r.*, e.title, v.name AS venue_name, p.starts_at, p.timezone, p.ends_at, p.status AS performance_status
            FROM performance_disruption_requests r JOIN performances p ON p.id=r.performance_id
            JOIN events e ON e.id=p.event_id
            LEFT JOIN venue_spaces s ON s.id=p.venue_space_id LEFT JOIN venues v ON v.id=s.venue_id
            """;

    private final JdbcTemplate jdbc;

    public JdbcSalesControlStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Pause> pause(UUID id) {
        return jdbc.query(PAUSES + " WHERE s.id=?", this::pauseRow, id).stream().findFirst();
    }

    @Override
    public Optional<Pause> openPause(UUID performance) {
        return jdbc.query(PAUSES + " WHERE s.performance_id=? AND s.closed_reason IS NULL", this::pauseRow, performance)
                .stream().findFirst();
    }

    @Override
    public Optional<Pause> latestPause(UUID performance) {
        return jdbc.query(PAUSES + " WHERE s.performance_id=? ORDER BY s.created_at DESC, s.id LIMIT 1",
                this::pauseRow, performance).stream().findFirst();
    }

    @Override
    public void insertPause(UUID id, UUID performance, String reason, UUID actor, long version) {
        jdbc.update("""
                INSERT INTO performance_sales_pauses(id,performance_id,reason,paused_by,pause_version)
                VALUES (?,?,?,?,?)
                """, id, performance, reason, actor, version);
    }

    @Override
    public void resumePause(UUID id, long version, UUID actor) {
        jdbc.update("""
                UPDATE performance_sales_pauses SET resume_version=?,resumed_by=?,closed_reason='RESUMED',
                    closed_at=clock_timestamp() WHERE id=?
                """, version, actor, id);
    }

    @Override
    public void supersedePause(UUID id) {
        jdbc.update("""
                UPDATE performance_sales_pauses SET closed_reason='SUPERSEDED',closed_at=clock_timestamp() WHERE id=?
                """, id);
    }

    @Override
    public Optional<Request> request(UUID id) {
        return jdbc.query("SELECT * FROM performance_disruption_requests WHERE id=?", this::requestRow, id)
                .stream().findFirst();
    }

    @Override
    public Optional<Request> openRequest(UUID performance) {
        return jdbc.query("SELECT * FROM performance_disruption_requests WHERE performance_id=? AND state='REQUESTED'",
                this::requestRow, performance).stream().findFirst();
    }

    @Override
    public List<Request> requests(UUID performance) {
        return jdbc.query("""
                SELECT * FROM performance_disruption_requests WHERE performance_id=?
                ORDER BY requested_at DESC, id LIMIT 50
                """, this::requestRow, performance);
    }

    @Override
    public List<QueueItem> queue(String state) {
        return jdbc.query(QUEUE + " WHERE r.state=? ORDER BY r.requested_at, r.id LIMIT 200", this::itemRow, state);
    }

    @Override
    public Optional<QueueItem> queueItem(UUID id) {
        return jdbc.query(QUEUE + " WHERE r.id=?", this::itemRow, id).stream().findFirst();
    }

    @Override
    public void insertRequest(Request request) {
        jdbc.update("""
                INSERT INTO performance_disruption_requests(id,performance_id,organization_id,kind,reason,
                    proposed_starts_at,proposed_ends_at,proposed_doors_open_at,requested_by)
                VALUES (?,?,?,?,?,?,?,?,?)
                """, request.id(), request.performanceId(), request.organizationId(), request.kind(), request.reason(),
                request.proposedStartsAt(), request.proposedEndsAt(), request.proposedDoorsOpenAt(),
                request.requestedBy());
    }

    @Override
    public boolean close(UUID id, String state, UUID actor, String reason) {
        return jdbc.update("""
                UPDATE performance_disruption_requests SET state=?,decided_by=?,decided_at=clock_timestamp(),
                    decision_reason=? WHERE id=? AND state='REQUESTED'
                """, state, actor, reason, id) == 1;
    }

    @Override
    public boolean accept(UUID id, UUID actor, UUID disruption) {
        return jdbc.update("""
                UPDATE performance_disruption_requests SET state='ACCEPTED',decided_by=?,
                    decided_at=clock_timestamp(),disruption_id=? WHERE id=? AND state='REQUESTED'
                """, actor, disruption, id) == 1;
    }

    private Pause pauseRow(ResultSet rs, int row) throws SQLException {
        return new Pause(rs.getObject("id", UUID.class), rs.getObject("performance_id", UUID.class),
                rs.getString("reason"), rs.getObject("paused_by", UUID.class), rs.getLong("pause_version"),
                rs.getObject("resume_version", Long.class), rs.getObject("resumed_by", UUID.class),
                rs.getString("closed_reason"), rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("closed_at", OffsetDateTime.class), rs.getBoolean("ticketing_ack"));
    }

    private Request requestRow(ResultSet rs, int row) throws SQLException {
        return new Request(rs.getObject("id", UUID.class), rs.getObject("performance_id", UUID.class),
                rs.getObject("organization_id", UUID.class), rs.getString("kind"), rs.getString("reason"),
                rs.getObject("proposed_starts_at", OffsetDateTime.class),
                rs.getObject("proposed_ends_at", OffsetDateTime.class),
                rs.getObject("proposed_doors_open_at", OffsetDateTime.class), rs.getString("state"),
                rs.getObject("requested_by", UUID.class), rs.getObject("requested_at", OffsetDateTime.class),
                rs.getObject("decided_by", UUID.class), rs.getObject("decided_at", OffsetDateTime.class),
                rs.getString("decision_reason"), rs.getObject("disruption_id", UUID.class));
    }

    private QueueItem itemRow(ResultSet rs, int row) throws SQLException {
        return new QueueItem(requestRow(rs, row), rs.getString("title"), rs.getString("venue_name"),
                rs.getObject("starts_at", OffsetDateTime.class), rs.getString("timezone"),
                rs.getObject("ends_at", OffsetDateTime.class), rs.getString("performance_status"));
    }
}