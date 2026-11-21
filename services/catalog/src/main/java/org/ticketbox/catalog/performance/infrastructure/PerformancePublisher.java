package org.ticketbox.catalog.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public final class PerformancePublisher {
    private static final Logger LOG = LoggerFactory.getLogger(PerformancePublisher.class);
    private final JdbcTemplate jdbc;
    private final RestClient http;
    private final ObjectMapper json;
    private final String ticketing;
    private final String checkin;

    public PerformancePublisher(JdbcTemplate jdbc, RestClient http, ObjectMapper json,
                                @Value("${split.ticketing-url}") String ticketing,
                                @Value("${split.checkin-url}") String checkin) {
        this.jdbc = jdbc;
        this.http = http;
        this.json = json;
        this.ticketing = ticketing;
        this.checkin = checkin;
    }

    @Scheduled(fixedDelayString = "${split.performance-config-interval-ms:2000}")
    public void publish() {
        deliver("ticketing", ticketing);
        deliver("checkin", checkin);
    }

    private void deliver(String consumer, String destination) {
        String ack = consumer + "_ack";
        String retryAt = consumer + "_retry_at";
        var pending = jdbc.query("""
                SELECT v.performance_id,v.version,v.payload
                FROM performance_sale_publications v
                WHERE NOT v.%1$s AND v.%2$s <= clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM performance_sale_publications older
                    WHERE older.performance_id=v.performance_id AND older.version<v.version AND NOT older.%1$s)
                ORDER BY v.%2$s,v.published_at,v.performance_id LIMIT 20
                """.formatted(ack, retryAt), (rs, row) -> new Pending(
                rs.getObject("performance_id", UUID.class), rs.getLong("version"), rs.getString("payload")));
        for (var item : pending) {
            if (jdbc.update("""
                    UPDATE performance_sale_publications SET %1$s=clock_timestamp()+INTERVAL '15 seconds'
                    WHERE performance_id=? AND version=? AND NOT %2$s AND %1$s<=clock_timestamp()
                    """.formatted(retryAt, ack), item.id(), item.version()) == 0) continue;
            try {
                var response = http.put().uri(destination + "/internal/" + consumer + "/catalog/performances/{id}", item.id())
                        .header(HttpHeaders.CONNECTION, "close")
                        .body(json.readTree(item.payload())).retrieve().body(JsonNode.class);
                if (response == null || !response.path("version").isIntegralNumber()
                        || !response.path("version").canConvertToLong()
                        || response.path("version").longValue() != item.version()) {
                    LOG.warn("Performance publication {} version {} did not receive a matching {} acknowledgment",
                            item.id(), item.version(), consumer);
                    continue;
                }
                jdbc.update("UPDATE performance_sale_publications SET " + ack + "=true WHERE performance_id=? AND version=?",
                        item.id(), item.version());
            } catch (RuntimeException | JsonProcessingException failure) {
                LOG.warn("Performance publication {} version {} will retry for {}", item.id(), item.version(), consumer);
            }
        }
    }

    private record Pending(UUID id, long version, String payload) {}
}
