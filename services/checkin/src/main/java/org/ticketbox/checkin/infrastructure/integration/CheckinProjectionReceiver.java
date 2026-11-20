package org.ticketbox.checkin.infrastructure.integration;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.application.port.catalog.PerformanceAdmissionSnapshot;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class CheckinProjectionReceiver
        implements org.ticketbox.checkin.application.port.ProjectionSnapshots {
    // v1 projections keep their current schema and intentionally ignore extra producer fields.
    private enum Row {
        CONCERT(
                "concerts",
                "id,title,description,artist_bio,venue_name,venue_address,event_date,doors_open_at,sale_start_at,"
                    + "sale_end_at,status,seat_map_svg,poster_url,created_by,created_at,updated_at,poster_public_id,is_public,organization_id"),
        TICKET_TYPE(
                "ticket_types",
                "id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active,created_at,updated_at",
                "available_qty"),
        TICKET(
                "tickets",
                "id,order_item_id,ticket_type_id,concert_id,user_id,qr_code,qr_secret,status,issued_at,used_at,created_at,updated_at",
                "status",
                "used_at");

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
    private final ObjectMapper json;

    public CheckinProjectionReceiver(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional
    public void catalog(JsonNode envelope) {
        UUID id = uuid(envelope, "id");
        long version = envelope.required("version").asLong();
        if (!newer("catalog", id, version)) return;
        if (isPerformance(id)) throw invalidSnapshot();

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
            jdbc.update("UPDATE concerts SET sales_suspended=?,resumed_admission_at=?::timestamptz WHERE id=?",
                    concert.path("sales_suspended").asBoolean(false), concert.path("resumed_admission_at").asText(null), id);
            Set<UUID> receivedTypes = new HashSet<>();
            for (JsonNode type : envelope.required("types")) {
                if (!uuid(type, "concert_id").equals(id)) {
                    throw new IllegalArgumentException(
                            "Ticket type belongs to a different concert");
                }
                receivedTypes.add(uuid(type, "id"));
                upsert(Row.TICKET_TYPE, type);
            }
            jdbc
                    .queryForList("SELECT id FROM ticket_types WHERE concert_id=?", UUID.class, id)
                    .stream()
                    .filter(typeId -> !receivedTypes.contains(typeId))
                    .forEach(typeId -> jdbc.update("DELETE FROM ticket_types WHERE id=?", typeId));
        }
        remember("catalog", id, version);
    }

    @Transactional
    public void ticket(JsonNode envelope) {
        applyTicket(uuid(envelope, "id"), envelope, false);
    }

    @Transactional
    public void performanceTicket(UUID id, JsonNode envelope) {
        try {
            applyTicket(id, envelope, true);
        } catch (IllegalArgumentException invalid) {
            throw invalidSnapshot();
        }
    }

    private void applyTicket(UUID id, JsonNode envelope, boolean performance) {
        var versionNode = envelope.required("version");
        if (!versionNode.canConvertToLong() || !versionNode.isIntegralNumber()
                || !id.equals(uuid(envelope, "id"))) {
            throw invalidSnapshot();
        }
        long version = versionNode.longValue();
        JsonNode ticket = envelope.required("ticket");
        UUID scope = uuid(ticket, "concert_id");
        if (!uuid(ticket, "id").equals(id)
                || performance && !uuid(ticket, "performance_id").equals(scope)) {
            throw invalidSnapshot();
        }
        if (!newer("ticket", id, version)) return;
        if (isPerformance(scope) != performance) throw invalidSnapshot();
        if (performance) {
            var validOffer = jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM ticket_types WHERE id=? AND concert_id=? AND performance_offer)",
                    Boolean.class, uuid(ticket, "ticket_type_id"), scope);
            var currentScopes = jdbc.queryForList("SELECT concert_id FROM tickets WHERE id=?", UUID.class, id);
            if (!Boolean.TRUE.equals(validOffer) || !currentScopes.isEmpty() && !currentScopes.getFirst().equals(scope)) {
                throw invalidSnapshot();
            }
        }
        upsert(Row.TICKET, ticket);
        if (performance) {
            jdbc.update("UPDATE tickets SET section_label=?,row_label=?,seat_label=? WHERE id=?",
                    optionalLabel(ticket, "section_label"), optionalLabel(ticket, "row_label"),
                    optionalLabel(ticket, "seat_label"), id);
        }
        // Snapshot replay must preserve a locally accepted admission and its used_at.
        String status = ticket.required("status").asText();
        jdbc.update(
                """
                UPDATE tickets SET status=CASE
                    WHEN ? IN ('CANCELLED','TRANSFERRED') THEN ?
                    WHEN EXISTS(SELECT 1 FROM checkin_logs WHERE ticket_id=?) THEN 'USED'
                    ELSE ? END
                WHERE id=?
                """,
                status,
                status,
                id,
                status,
                id);
        remember("ticket", id, version);
    }

    @Transactional
    public long performance(PerformanceAdmissionSnapshot snapshot) {
        UUID id = snapshot.id();
        lockSource("catalog", id);
        var current = jdbc.query("""
                        SELECT organization_id,performance_snapshot_version,performance_snapshot_digest FROM concerts WHERE id=?
                        """,
                (row, index) -> new PerformanceVersion(row.getObject("organization_id", UUID.class),
                        row.getObject("performance_snapshot_version", Long.class),
                        row.getString("performance_snapshot_digest")), id);
        if (snapshot.legacyConcertId() != null) {
            throw invalidSnapshot();
        }
        String digest = digest(snapshot);
        if (!current.isEmpty()) {
            var existing = current.getFirst();
            if (existing.version() == null || !snapshot.organizationId().equals(existing.organization())) {
                throw invalidSnapshot();
            }
            if (existing.version() > snapshot.version()) return existing.version();
            if (existing.version() == snapshot.version()) {
                if (!digest.equals(existing.digest())) throw invalidSnapshot();
                return existing.version();
            }
        }

        var offerIds = new HashSet<UUID>();
        if (snapshot.offers().stream().anyMatch(offer -> !offerIds.add(offer.id()))) {
            throw invalidSnapshot();
        }
        jdbc.update("""
                INSERT INTO concerts(id,organization_id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,sales_suspended,resumed_admission_at,is_public,
                    performance_snapshot_version,performance_snapshot_digest)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,venue_name=EXCLUDED.venue_name,
                    venue_address=EXCLUDED.venue_address,event_date=EXCLUDED.event_date,doors_open_at=EXCLUDED.doors_open_at,
                    sale_start_at=EXCLUDED.sale_start_at,sale_end_at=EXCLUDED.sale_end_at,status=EXCLUDED.status,
                    sales_suspended=EXCLUDED.sales_suspended,resumed_admission_at=EXCLUDED.resumed_admission_at,
                    is_public=EXCLUDED.is_public,performance_snapshot_version=EXCLUDED.performance_snapshot_version,
                    performance_snapshot_digest=EXCLUDED.performance_snapshot_digest,updated_at=now()
                """, id, snapshot.organizationId(), snapshot.title(), snapshot.venueName(),
                snapshot.venueAddress() == null ? "" : snapshot.venueAddress(), snapshot.startsAt(),
                snapshot.doorsOpenAt(), snapshot.saleStartAt(), snapshot.saleEndAt(), snapshot.status(),
                snapshot.salesSuspended(), snapshot.resumedAdmissionAt(), snapshot.publicVisible(), snapshot.version(), digest);
        // Retired offers remain available as historical references for issued tickets.
        jdbc.update("UPDATE ticket_types SET is_active=false WHERE concert_id=? AND is_active", id);
        for (var offer : snapshot.offers()) {
            int saved = jdbc.update("""
                    INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,is_active,performance_offer)
                    VALUES(?,?,?,?,1,0,?,?,true)
                    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price,
                        max_per_account=EXCLUDED.max_per_account,is_active=EXCLUDED.is_active,updated_at=now()
                    WHERE ticket_types.concert_id=EXCLUDED.concert_id AND ticket_types.performance_offer
                    """, offer.id(), id, offer.name(), offer.price(), snapshot.maxPerAccount(), offer.active());
            if (saved != 1) throw invalidSnapshot();
        }
        return snapshot.version();
    }

    private boolean isPerformance(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM concerts WHERE id=? AND performance_snapshot_version IS NOT NULL)",
                Boolean.class, id));
    }

    private String digest(PerformanceAdmissionSnapshot snapshot) {
        try {
            byte[] bytes = json.writeValueAsBytes(snapshot);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (JsonProcessingException | NoSuchAlgorithmException failure) {
            throw new IllegalStateException("Could not hash performance admission configuration", failure);
        }
    }

    private static String optionalLabel(JsonNode ticket, String key) {
        JsonNode value = ticket.path(key);
        if (value.isMissingNode() || value.isNull()) return null;
        if (!value.isTextual() || value.textValue().length() > 500) throw invalidSnapshot();
        return value.textValue();
    }

    private static AppException invalidSnapshot() {
        return new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
    }

    private record PerformanceVersion(UUID organization, Long version, String digest) {}

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
        lockSource(kind, id);
        return jdbc.queryForObject(
                        """
SELECT COALESCE(max(version),0) FROM projection_versions WHERE kind=? AND id=?
""",
                        Long.class,
                        kind,
                        id)
                < version;
    }

    private void lockSource(String kind, UUID id) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0)) IS NULL",
                Boolean.class, kind + ":" + id);
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
