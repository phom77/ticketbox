package com.ticketbox.notifications;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class NotificationMetrics {
    private final JdbcTemplate db;
    private final AtomicLong pending=new AtomicLong(),failed=new AtomicLong(),age=new AtomicLong();
    public NotificationMetrics(JdbcTemplate db,MeterRegistry metrics) {
        this.db=db;
        metrics.gauge("ticketbox.notification.pending",pending);
        metrics.gauge("ticketbox.notification.failed",failed);
        metrics.gauge("ticketbox.notification.oldest.pending.seconds",age);
    }
    @Scheduled(fixedDelay=10000) public void sample() {
        var value=db.queryForMap("SELECT count(*) FILTER(WHERE status='PENDING') AS pending,count(*) FILTER(WHERE status='FAILED') AS failed,coalesce(extract(epoch FROM now()-min(created_at) FILTER(WHERE status='PENDING')),0) AS age FROM notifications WHERE channel='EMAIL'");
        pending.set(((Number)value.get("pending")).longValue());failed.set(((Number)value.get("failed")).longValue());age.set(((Number)value.get("age")).longValue());
    }
}
