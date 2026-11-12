package org.ticketbox.identity.account.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.identity.account.application.port.AccountAccessAudit;

import java.util.UUID;

@Repository
class JdbcAccountAccessAudit implements AccountAccessAudit {
    private final JdbcTemplate jdbc;

    JdbcAccountAccessAudit(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void record(UUID actor, UUID target, String action, String value) {
        jdbc.update("INSERT INTO account_access_audit (actor_id, target_id, action, value) VALUES (?, ?, ?, ?)",
                actor, target, action, value);
    }
}
