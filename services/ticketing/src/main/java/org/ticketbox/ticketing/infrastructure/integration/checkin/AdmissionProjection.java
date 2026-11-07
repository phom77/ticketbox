package org.ticketbox.ticketing.infrastructure.integration.checkin;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@org.springframework.stereotype.Component
public class AdmissionProjection
        implements org.ticketbox.ticketing.application.port.AdmissionFeedback {
    private final JdbcTemplate jdbc;

    public AdmissionProjection(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void project(Admission admission) {
        if (!jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM tickets WHERE id=?)",
                Boolean.class,
                admission.ticketId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        jdbc.update(
                """
UPDATE tickets SET status='USED',used_at=?,updated_at=now() WHERE id=? AND status='VALID'
""",
                admission.usedAt(),
                admission.ticketId());
    }
}
