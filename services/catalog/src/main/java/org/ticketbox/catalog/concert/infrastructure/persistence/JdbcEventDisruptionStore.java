package org.ticketbox.catalog.concert.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcEventDisruptionStore implements EventDisruptionStore {
    private static final RowMapper<Operation> OPERATION = (row, index) -> new Operation(
            row.getObject("id", UUID.class), row.getObject("concert_id", UUID.class), Kind.valueOf(row.getString("kind")),
            row.getString("reason"), row.getObject("actor_id", UUID.class), row.getObject("event_date", OffsetDateTime.class));
    private static final RowMapper<Entry> ENTRY = (row, index) -> new Entry(OPERATION.mapRow(row, index),
            new Window(row.getObject("doors_open_at", OffsetDateTime.class), row.getObject("sale_start_at", OffsetDateTime.class),
                    row.getObject("sale_end_at", OffsetDateTime.class)),
            row.getLong("pause_version"), row.getObject("resume_version", Long.class), row.getObject("dispatched_at") != null);

    private final JdbcTemplate db;

    JdbcEventDisruptionStore(JdbcTemplate db) { this.db = db; }

    public Optional<Entry> find(UUID id) {
        return db.query("SELECT * FROM event_disruptions WHERE id=?", ENTRY, id).stream().findFirst();
    }

    public Optional<Entry> current(UUID concert) {
        return db.query("SELECT * FROM event_disruptions WHERE concert_id=? ORDER BY created_at DESC,id LIMIT 1", ENTRY, concert)
                .stream().findFirst();
    }

    public void insert(Entry entry) {
        var op = entry.operation();
        db.update("""
                INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id,event_date,doors_open_at,sale_start_at,sale_end_at,pause_version)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """, op.id(), op.concertId(), op.kind().name(), op.reason(), op.actorId(), op.eventDate(),
                entry.window().doorsOpenAt(), entry.window().saleStartAt(), entry.window().saleEndAt(), entry.pauseVersion());
    }

    public void resume(UUID id, long version, UUID actor) {
        db.update("UPDATE event_disruptions SET resume_version=?,resumed_by=? WHERE id=? AND resume_version IS NULL", version, actor, id);
    }

    public List<Operation> readyToDispatch() {
        return db.query("""
                SELECT d.* FROM event_disruptions d JOIN sale_config_outbox o ON o.concert_id=d.concert_id
                WHERE d.dispatched_at IS NULL AND o.ticketing_version>=d.pause_version AND o.checkin_version>=d.pause_version
                ORDER BY d.created_at,d.id LIMIT 10
                """, OPERATION);
    }

    public void dispatched(UUID id) {
        db.update("UPDATE event_disruptions SET dispatched_at=clock_timestamp() WHERE id=? AND dispatched_at IS NULL", id);
    }
}
