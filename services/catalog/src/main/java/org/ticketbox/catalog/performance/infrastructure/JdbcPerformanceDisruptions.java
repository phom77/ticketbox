package org.ticketbox.catalog.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Kind;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Operation;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionStore;
import org.ticketbox.catalog.performance.application.PerformanceDisruptions.Command;

@Repository
public class JdbcPerformanceDisruptions implements PerformanceDisruptionStore {
    private static final String ENTRIES = """
            SELECT d.*, p.ticketing_ack, p.checkin_ack FROM performance_disruptions d
            JOIN performance_sale_publications p ON p.performance_id=d.performance_id
              AND p.version=coalesce(d.resume_version,d.pause_version)
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public JdbcPerformanceDisruptions(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public Optional<Entry> find(UUID id) {
        return jdbc.query(ENTRIES + " WHERE d.id=?", this::entry, id).stream().findFirst();
    }

    @Override
    public Optional<Entry> current(UUID performance) {
        return jdbc.query(ENTRIES + " WHERE d.performance_id=? ORDER BY d.pause_version DESC LIMIT 1",
                this::entry, performance).stream().findFirst();
    }

    @Override
    public void insert(Operation op, Command command, long version) {
        jdbc.update("""
                INSERT INTO performance_disruptions(id,performance_id,kind,reason,actor_id,event_date,command,pause_version)
                VALUES(?,?,?,?,?,?,CAST(? AS JSONB),?)
                """, op.id(), op.concertId(), op.kind().name(), op.reason(), op.actorId(), op.eventDate(), encode(command),
                version);
    }

    @Override
    public void resume(UUID id, long version, UUID actor) {
        jdbc.update("UPDATE performance_disruptions SET resume_version=?,resumed_by=? WHERE id=?",
                version, actor, id);
    }

    @Override
    public List<Operation> claimReady() {
        return jdbc.query("""
                WITH ready AS (
                    SELECT d.id FROM performance_disruptions d
                    JOIN performance_sale_publications p ON p.performance_id=d.performance_id
                      AND p.version=d.pause_version
                    WHERE d.dispatched_at IS NULL AND d.retry_at<=clock_timestamp()
                      AND p.ticketing_ack AND p.checkin_ack ORDER BY d.retry_at,d.id
                    LIMIT 20 FOR UPDATE OF d SKIP LOCKED
                )
                UPDATE performance_disruptions d SET retry_at=clock_timestamp()+INTERVAL '15 seconds'
                FROM ready WHERE ready.id=d.id
                RETURNING d.*
                """, (rs, n) -> operation(rs));
    }

    @Override
    public void dispatched(UUID id) {
        jdbc.update("UPDATE performance_disruptions SET dispatched_at=clock_timestamp() WHERE id=?", id);
    }

    private Entry entry(ResultSet rs, int row) throws SQLException {
        return new Entry(operation(rs), decode(rs.getString("command")), rs.getLong("pause_version"),
                rs.getObject("resume_version", Long.class), rs.getObject("dispatched_at", OffsetDateTime.class) != null,
                rs.getBoolean("ticketing_ack"), rs.getBoolean("checkin_ack"));
    }

    private static Operation operation(ResultSet rs) throws SQLException {
        return new Operation(rs.getObject("id", UUID.class), rs.getObject("performance_id", UUID.class),
                Kind.valueOf(rs.getString("kind")), rs.getString("reason"), rs.getObject("actor_id", UUID.class),
                rs.getObject("event_date", OffsetDateTime.class));
    }

    private String encode(Command command) {
        try {
            return json.writeValueAsString(command);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Cannot persist performance operation", failure);
        }
    }

    private Command decode(String document) {
        try {
            return json.readValue(document, Command.class);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Cannot read performance operation", failure);
        }
    }
}
