package com.ticketbox.module.notification.infrastructure;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.UUID;

/** Repairs the DB-commit / Rabbit publish gap. Consumer leases and terminal status deduplicate delivery. */
@Component
@RequiredArgsConstructor
@Slf4j
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class PendingEmailRecovery {
    private final JdbcTemplate jdbc;
    private final EmailNotificationPublisher publisher;

    @Scheduled(fixedDelayString="${ticketbox.notification.recovery-interval-ms:60000}")
    @SchedulerLock(name="pendingEmailRecovery", lockAtMostFor="PT10M", lockAtLeastFor="PT30S")
    public void recover() {
        var ids = jdbc.queryForList("""
                SELECT id FROM notifications WHERE channel='EMAIL' AND status='PENDING'
                  AND updated_at < now()-interval '1 minute'
                  AND (delivery_lease_until IS NULL OR delivery_lease_until < now())
                ORDER BY updated_at LIMIT 100
                """, UUID.class);
        for (UUID id : ids) {
            try { publisher.publishEmailNotification(id); }
            catch (RuntimeException failure) { log.warn("Pending email {} retained for retry", id); break; }
        }
    }
}
