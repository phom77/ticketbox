package org.ticketbox.checkin.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.Map;
import java.util.UUID;

@Component
public class AdmissionPublisher {
    private final JdbcTemplate jdbc;
    private final RestClient http;
    private final String ticketing;

    public AdmissionPublisher(JdbcTemplate jdbc,RestClient http,@Value("${split.ticketing-url}") String ticketing) {
        this.jdbc=jdbc;
        this.http=http;
        this.ticketing=ticketing;
    }

    @Scheduled(fixedDelayString="${split.admission-interval-ms:1000}")
    public void publish() {
        for(var row:jdbc.queryForList("""
                SELECT o.ticket_id,c.checked_at FROM admission_outbox o JOIN checkin_logs c ON c.ticket_id=o.ticket_id
                WHERE NOT o.delivered ORDER BY o.ticket_id LIMIT 100
                """)) {
            try {
                UUID id=(UUID)row.get("ticket_id");
                String usedAt=((java.sql.Timestamp)row.get("checked_at")).toInstant().toString();
                http.post().uri(ticketing+"/internal/split/admissions")
                        .body(Map.of("ticketId",id,"usedAt",usedAt)).retrieve().toBodilessEntity();
                jdbc.update("UPDATE admission_outbox SET delivered=true WHERE ticket_id=?",id);
            } catch(RuntimeException failure) {
                org.slf4j.LoggerFactory.getLogger(getClass()).debug("Admission feedback will retry",failure);
            }
        }
    }
}
