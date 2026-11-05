package org.ticketbox.ticketing;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
public class AdmissionProjectionApi {
    public record Admission(@NotNull UUID ticketId,@NotNull OffsetDateTime usedAt) {}
    private final JdbcTemplate jdbc;

    public AdmissionProjectionApi(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    @PostMapping("/internal/split/admissions")
    @Transactional
    public void project(@Valid @RequestBody Admission admission) {
        if(!jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM tickets WHERE id=?)",Boolean.class,admission.ticketId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        jdbc.update("""
                UPDATE tickets SET status='USED',used_at=?,updated_at=now() WHERE id=? AND status='VALID'
                """,admission.usedAt(),admission.ticketId());
    }
}
