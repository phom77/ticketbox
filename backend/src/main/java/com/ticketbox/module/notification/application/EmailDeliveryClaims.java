package com.ticketbox.module.notification.application;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Short transactions around SMTP, with a lease shared by every consumer replica. */
@Service
@RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class EmailDeliveryClaims {
    private final JdbcTemplate jdbc;

    @Transactional
    public boolean claim(UUID id, UUID owner) {
        return jdbc.update("""
                UPDATE notifications SET delivery_owner=?, delivery_lease_until=now()+interval '5 minutes'
                WHERE id=? AND channel='EMAIL' AND status='PENDING'
                  AND (delivery_lease_until IS NULL OR delivery_lease_until < now())
                """, owner, id) == 1;
    }

    @Transactional
    public void complete(UUID id, UUID owner, String status, String error) {
        jdbc.update("""
                UPDATE notifications SET status=?, last_error=?, sent_at=CASE WHEN ?='SENT' THEN now() ELSE sent_at END,
                  updated_at=now(), delivery_owner=NULL, delivery_lease_until=NULL
                WHERE id=? AND delivery_owner=? AND status='PENDING'
                """, status, error, status, id, owner);
    }

    @Transactional
    public void fail(UUID id, UUID owner, String error) {
        jdbc.update("""
                UPDATE notifications SET attempts=attempts+1, last_error=?, updated_at=now(),
                  status=CASE WHEN attempts+1>=3 THEN 'FAILED' ELSE 'PENDING' END,
                  delivery_owner=NULL, delivery_lease_until=NULL
                WHERE id=? AND delivery_owner=? AND status='PENDING'
                """, error, id, owner);
    }
}
