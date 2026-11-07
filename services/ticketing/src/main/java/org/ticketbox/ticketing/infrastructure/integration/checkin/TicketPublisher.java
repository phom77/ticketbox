package org.ticketbox.ticketing.infrastructure.integration.checkin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Component
public class TicketPublisher {
    private final JdbcTemplate jdbc;
    private final RestClient http;
    private final ObjectMapper json;
    private final String destination;

    public TicketPublisher(
            JdbcTemplate jdbc,
            RestClient http,
            ObjectMapper json,
            @Value("${split.checkin-url}") String destination) {
        this.jdbc = jdbc;
        this.http = http;
        this.json = json;
        this.destination = destination;
    }

    @Scheduled(fixedDelayString = "${split.ticket-interval-ms:1000}")
    public void publish() {
        for (String payload :
                jdbc.queryForList(
                        """
SELECT jsonb_build_object('id',o.ticket_id,'version',o.version,'ticket',to_jsonb(t))::text
FROM checkin_ticket_outbox o JOIN tickets t ON t.id=o.ticket_id
WHERE o.delivered_version<o.version ORDER BY o.ticket_id LIMIT 100
""",
                        String.class)) {
            try {
                JsonNode event = json.readTree(payload);
                http.post()
                        .uri(destination + "/internal/split/tickets")
                        .body(event)
                        .retrieve()
                        .toBodilessEntity();
                jdbc.update(
                        "UPDATE checkin_ticket_outbox SET"
                            + " delivered_version=GREATEST(delivered_version,?) WHERE ticket_id=?",
                        event.required("version").asLong(),
                        UUID.fromString(event.required("id").asText()));
            } catch (Exception failure) {
                org.slf4j.LoggerFactory.getLogger(getClass())
                        .warn("Ticket projection will retry: {}", failure.getMessage());
            }
        }
    }
}
