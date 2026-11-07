package org.ticketbox.ticketing.infrastructure.integration.catalog;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@org.springframework.stereotype.Component
public class TicketingCatalogReceiver
        implements org.ticketbox.ticketing.application.port.CatalogSnapshots {
    // v1 projections keep their current schema and intentionally ignore extra producer fields.
    private enum Row {
        CONCERT(
                "concerts",
                "id,title,description,artist_bio,venue_name,venue_address,event_date,doors_open_at,sale_start_at,"
                    + "sale_end_at,status,seat_map_svg,poster_url,created_by,created_at,updated_at,poster_public_id,is_public"),
        TICKET_TYPE(
                "ticket_types",
                "id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active,created_at,updated_at",
                "available_qty");

        private final String table;
        private final List<String> columns;
        private final String upsert;

        Row(String table, String columns, String... preserveOnUpdate) {
            this.table = table;
            this.columns = List.of(columns.split(","));
            Set<String> preserved = Set.of(preserveOnUpdate);
            String updates =
                    this.columns.stream()
                            .filter(column -> !column.equals("id") && !preserved.contains(column))
                            .map(column -> column + "=EXCLUDED." + column)
                            .collect(Collectors.joining(","));
            this.upsert =
                    """
INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::%1$s, CAST(? AS jsonb))
ON CONFLICT(id) DO UPDATE SET %3$s
"""
                            .formatted(table, columns, updates);
        }
    }

    private final JdbcTemplate jdbc;

    public TicketingCatalogReceiver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void catalog(JsonNode envelope) {
        UUID id = uuid(envelope, "id");
        long version = envelope.required("version").asLong();
        if (!newer("catalog", id, version)) return;

        if (envelope.path("deleted").asBoolean()) {
            jdbc.update("DELETE FROM ticket_types WHERE concert_id=?", id);
            jdbc.update("DELETE FROM concerts WHERE id=?", id);
        } else {
            JsonNode concert = envelope.required("concert");
            if (!uuid(concert, "id").equals(id)) {
                throw new IllegalArgumentException(
                        "Catalog snapshot ID does not match its concert");
            }
            upsert(Row.CONCERT, concert);
            Set<UUID> receivedTypes = new HashSet<>();
            for (JsonNode type : envelope.required("types")) {
                if (!uuid(type, "concert_id").equals(id)) {
                    throw new IllegalArgumentException(
                            "Ticket type belongs to a different concert");
                }
                UUID typeId = uuid(type, "id");
                receivedTypes.add(typeId);
                upsert(Row.TICKET_TYPE, type);
                updateStock(
                        typeId,
                        type.required("total_quantity").asInt(),
                        type.required("is_active").asBoolean());
            }
            jdbc
                    .queryForList("SELECT id FROM ticket_types WHERE concert_id=?", UUID.class, id)
                    .stream()
                    .filter(typeId -> !receivedTypes.contains(typeId))
                    .forEach(typeId -> jdbc.update("DELETE FROM ticket_types WHERE id=?", typeId));
        }
        remember("catalog", id, version);
    }

    private void updateStock(UUID typeId, int total, boolean active) {
        jdbc.update(
                """
                INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active)
                VALUES(?,?,?,?) ON CONFLICT DO NOTHING
                """,
                typeId,
                total,
                total,
                active);
        int updated =
                jdbc.update(
                        """
UPDATE ticket_inventory SET
    available_qty=CASE WHEN total_quantity=? THEN available_qty ELSE ? END,
    total_quantity=?,active=?,updated_at=now()
WHERE ticket_type_id=? AND (total_quantity=? OR available_qty=total_quantity)
""",
                        total,
                        total,
                        total,
                        active,
                        typeId,
                        total);
        if (updated != 1)
            throw new IllegalStateException("Allocated inventory configuration cannot be replaced");
    }

    private void upsert(Row projection, JsonNode data) {
        if (projection.columns.stream().anyMatch(column -> !data.has(column))) {
            throw new IllegalArgumentException("Incomplete " + projection.table + " projection");
        }
        jdbc.update(projection.upsert, data.toString());
    }

    private static UUID uuid(JsonNode data, String field) {
        return UUID.fromString(data.required(field).asText());
    }

    private boolean newer(String kind, UUID id, long version) {
        if (version < 1) throw new IllegalArgumentException("Invalid source version");
        jdbc.queryForObject(
                "SELECT pg_advisory_xact_lock(hashtextextended(?,0)) IS NULL",
                Boolean.class,
                kind + ":" + id);
        return jdbc.queryForObject(
                        """
SELECT COALESCE(max(version),0) FROM projection_versions WHERE kind=? AND id=?
""",
                        Long.class,
                        kind,
                        id)
                < version;
    }

    private void remember(String kind, UUID id, long version) {
        jdbc.update(
                """
                INSERT INTO projection_versions(kind,id,version) VALUES(?,?,?)
                ON CONFLICT(kind,id) DO UPDATE SET version=EXCLUDED.version
                """,
                kind,
                id,
                version);
    }
}
