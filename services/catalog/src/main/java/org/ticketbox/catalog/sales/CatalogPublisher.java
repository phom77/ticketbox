package org.ticketbox.catalog.sales;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Service
public class CatalogPublisher {
    private static final Logger LOG = LoggerFactory.getLogger(CatalogPublisher.class);
    private final JdbcTemplate jdbc;
    private final RestClient http;
    private final ObjectMapper json;
    private final String ticketing;
    private final String checkin;

    public CatalogPublisher(JdbcTemplate jdbc, RestClient http, ObjectMapper json,
            @Value("${split.ticketing-url}") String ticketing, @Value("${split.checkin-url}") String checkin) {
        this.jdbc = jdbc;
        this.http = http;
        this.json = json;
        this.ticketing = ticketing;
        this.checkin = checkin;
    }

    @Scheduled(fixedDelayString = "${split.config-interval-ms:2000}")
    public void publish() {
        for (UUID id : jdbc.queryForList("""
                SELECT concert_id FROM sale_config_outbox
                WHERE ticketing_version<version OR checkin_version<version ORDER BY concert_id LIMIT 100
                """, UUID.class)) {
            tryDeliver(id, ticketing, "ticketing_version");
            tryDeliver(id, checkin, "checkin_version");
        }
    }

    public void acknowledgeSales() {
        for (UUID id : jdbc.queryForList("""
                SELECT concert_id FROM sale_config_outbox WHERE ticketing_version<version ORDER BY concert_id
                """, UUID.class)) {
            deliver(id, ticketing, "ticketing_version");
        }
    }

    private void tryDeliver(UUID id, String destination, String ackColumn) {
        try {
            deliver(id, destination, ackColumn);
        } catch (RuntimeException failure) {
            LOG.warn("Catalog configuration {} for {} will retry: {}", id, destination, failure.getMessage());
        }
    }

    private void deliver(UUID id, String destination, String ackColumn) {
        // The legacy v1 receivers upsert a full row. Keep this field list stable as the producer evolves.
        JsonNode envelope = jdbc.query("""
                SELECT jsonb_build_object('id',o.concert_id,'version',o.version,'deleted',c.id IS NULL,
                  'concert',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id',c.id,'title',c.title,'description',c.description,'artist_bio',c.artist_bio,
                    'venue_name',c.venue_name,'venue_address',c.venue_address,'event_date',c.event_date,
                    'doors_open_at',c.doors_open_at,'sale_start_at',c.sale_start_at,'sale_end_at',c.sale_end_at,
                    'status',c.status,'seat_map_svg',c.seat_map_svg,'poster_url',c.poster_url,'created_by',c.created_by,
                    'created_at',c.created_at,'updated_at',c.updated_at,'poster_public_id',c.poster_public_id,
                    'is_public',c.is_public) END,
                  'types',COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id',t.id,'concert_id',t.concert_id,'name',t.name,'price',t.price,
                    'total_quantity',t.total_quantity,'available_qty',t.available_qty,'max_per_account',t.max_per_account,
                    'zone_color',t.zone_color,'is_active',t.is_active,'created_at',t.created_at,'updated_at',t.updated_at)
                    ORDER BY t.id) FROM ticket_types t WHERE t.concert_id=o.concert_id),'[]'::jsonb))::text
                FROM sale_config_outbox o LEFT JOIN concerts c ON c.id=o.concert_id
                WHERE o.concert_id=? AND o.%s<o.version
                """.formatted(ackColumn), rs -> {
                    if (!rs.next()) return null;
                    try { return json.readTree(rs.getString(1)); }
                    catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
                        throw new IllegalStateException("Invalid catalog snapshot", failure);
                    }
                }, id);
        if (envelope == null) return;
        var response = http.post().uri(destination + "/internal/split/catalog").body(envelope)
                .retrieve().toBodilessEntity();
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new IllegalStateException("Catalog receiver returned " + response.getStatusCode());
        }
        jdbc.update("UPDATE sale_config_outbox SET " + ackColumn + "=GREATEST(" + ackColumn + ",?) WHERE concert_id=?",
                envelope.required("version").asLong(), id);
    }

    @Scheduled(fixedDelayString = "${split.stock-interval-ms:2000}")
    public void stock() {
        try {
            JsonNode stocks = http.get().uri(ticketing + "/internal/split/stock").retrieve().body(JsonNode.class);
            if (stocks == null) return;
            for (JsonNode stock : stocks) {
                jdbc.update("""
                        INSERT INTO catalog_availability(ticket_type_id,available_qty) VALUES(?,?)
                        ON CONFLICT(ticket_type_id) DO UPDATE SET available_qty=EXCLUDED.available_qty
                        """, UUID.fromString(stock.required("ticket_type_id").asText()), stock.required("available_qty").asInt());
            }
        } catch (RuntimeException failure) {
            LOG.debug("Serving last known inventory projection", failure);
        }
    }
}
