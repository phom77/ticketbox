package org.ticketbox.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Service
public class CatalogPublisher {
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
            try {
                deliver(id, ticketing, "ticketing_version");
                deliver(id, checkin, "checkin_version");
            } catch (RuntimeException failure) {
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Catalog configuration {} will retry: {}", id, failure.getMessage());
            }
        }
    }

    public void acknowledgeSales() {
        for (UUID id : jdbc.queryForList("""
                SELECT concert_id FROM sale_config_outbox WHERE ticketing_version<version ORDER BY concert_id
                """, UUID.class)) {
            deliver(id, ticketing, "ticketing_version");
        }
    }

    private void deliver(UUID id, String destination, String ackColumn) {
        JsonNode envelope = jdbc.queryForObject("""
                SELECT jsonb_build_object('id',o.concert_id,'version',o.version,'deleted',c.id IS NULL,
                  'concert',to_jsonb(c),'types',COALESCE(
                    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM ticket_types t WHERE t.concert_id=o.concert_id),'[]'::jsonb))::text
                FROM sale_config_outbox o LEFT JOIN concerts c ON c.id=o.concert_id WHERE o.concert_id=?
                """, (rs, row) -> {
                    try { return json.readTree(rs.getString(1)); }
                    catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
                        throw new IllegalStateException("Invalid catalog snapshot", failure);
                    }
                }, id);
        http.post().uri(destination + "/internal/split/catalog").body(envelope).retrieve().toBodilessEntity();
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
            org.slf4j.LoggerFactory.getLogger(getClass()).debug("Serving last known inventory projection", failure);
        }
    }
}
