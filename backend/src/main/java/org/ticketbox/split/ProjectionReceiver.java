package org.ticketbox.split;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

public class ProjectionReceiver {
    private final JdbcTemplate jdbc;
    private final ProjectionWriter writer;
    private final boolean ticketing;

    public ProjectionReceiver(JdbcTemplate jdbc, boolean ticketing) {
        this.jdbc = jdbc;
        this.writer = new ProjectionWriter(jdbc);
        this.ticketing = ticketing;
    }

    @Transactional
    public void catalog(JsonNode envelope) {
        UUID id = UUID.fromString(envelope.required("id").asText());
        long version = envelope.required("version").asLong();
        if (!newer("catalog", id, version)) return;
        if (envelope.path("deleted").asBoolean()) {
            jdbc.update("DELETE FROM ticket_types WHERE concert_id=?", id);
            jdbc.update("DELETE FROM concerts WHERE id=?", id);
        } else {
            writer.upsert("concerts", envelope.required("concert"), Set.of());
            var ids = new java.util.ArrayList<UUID>();
            for (JsonNode type : envelope.required("types")) {
                UUID typeId = UUID.fromString(type.required("id").asText());
                ids.add(typeId);
                writer.upsert("ticket_types", type, Set.of("available_qty"));
                if (ticketing) {
                    int total = type.required("total_quantity").asInt();
                    jdbc.update("""
                            INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active)
                            VALUES(?,?,?,?) ON CONFLICT DO NOTHING
                            """, typeId, total, total, type.required("is_active").asBoolean());
                    int updated = jdbc.update("""
                            UPDATE ticket_inventory SET
                            available_qty=CASE WHEN total_quantity=? THEN available_qty ELSE ? END,
                            total_quantity=?,active=?,updated_at=now()
                            WHERE ticket_type_id=? AND (total_quantity=? OR available_qty=total_quantity)
                            """, total, total, total, type.required("is_active").asBoolean(), typeId, total);
                    if (updated != 1) throw new IllegalStateException("Allocated inventory configuration cannot be replaced");
                }
            }
            jdbc.queryForList("SELECT id FROM ticket_types WHERE concert_id=?", UUID.class, id).stream()
                    .filter(typeId -> !ids.contains(typeId))
                    .forEach(typeId -> jdbc.update("DELETE FROM ticket_types WHERE id=?", typeId));
        }
        remember("catalog", id, version);
    }

    @Transactional
    public void ticket(JsonNode envelope) {
        if (ticketing) throw new IllegalStateException("Ticket projection belongs to Check-in");
        UUID id = UUID.fromString(envelope.required("id").asText());
        long version = envelope.required("version").asLong();
        if (!newer("ticket", id, version)) return;
        JsonNode row = envelope.required("ticket");
        writer.upsert("tickets", row, Set.of("status", "used_at"));
        // An issued VALID snapshot must never erase a locally accepted admission.
        jdbc.update("""
                UPDATE tickets SET status=CASE
                    WHEN ? IN ('CANCELLED','TRANSFERRED') THEN ?
                    WHEN EXISTS(SELECT 1 FROM checkin_logs WHERE ticket_id=?) THEN 'USED'
                    ELSE ? END
                WHERE id=?
                """, row.required("status").asText(), row.required("status").asText(),
                id, row.required("status").asText(), id);
        remember("ticket", id, version);
    }

    private boolean newer(String kind, UUID id, long version) {
        if (version < 1) throw new IllegalArgumentException("Invalid source version");
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0)) IS NULL",
                Boolean.class, kind + ":" + id);
        return jdbc.queryForObject("""
                SELECT COALESCE(max(version),0) FROM projection_versions WHERE kind=? AND id=?
                """, Long.class, kind, id) < version;
    }

    private void remember(String kind, UUID id, long version) {
        jdbc.update("""
                INSERT INTO projection_versions(kind,id,version) VALUES(?,?,?)
                ON CONFLICT(kind,id) DO UPDATE SET version=EXCLUDED.version
                """, kind, id, version);
    }
}
