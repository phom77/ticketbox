package com.ticketbox.notifications.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class NotificationStore
        implements com.ticketbox.notifications.application.port.NotificationRepository {
    private final JdbcTemplate db;

    public NotificationStore(JdbcTemplate db) {
        this.db = db;
    }

    @Transactional
    public boolean recordCommand(com.ticketbox.notifications.domain.NotificationCommand command) {
        return db.update(
                        "INSERT INTO notification_inbox(event_id,event_type,correlation_id)"
                                + " VALUES(?,?,?) ON CONFLICT DO NOTHING",
                        command.eventId(),
                        command.eventType(),
                        command.correlationId())
                == 1;
    }

    @Transactional
    public void save(com.ticketbox.notifications.domain.Notification notification) {
        String channel = notification.channel().name();
        db.update(
                "INSERT INTO"
                    + " notifications(user_id,channel,event_type,subject,body,status,sent_at,reference_id,message_id)"
                    + " VALUES(?,?,?,?,?,?,CASE WHEN ?='APP' THEN now() ELSE NULL END,?,?) ON"
                    + " CONFLICT (message_id) DO NOTHING",
                notification.userId(),
                channel,
                notification.eventType(),
                notification.subject(),
                notification.body(),
                channel.equals("APP") ? "SENT" : "PENDING",
                channel,
                notification.orderId(),
                notification.messageId());
    }

    @Transactional
    public Delivery claim() {
        UUID owner = UUID.randomUUID();
        var rows =
                db.query(
                        """
UPDATE notifications SET delivery_owner=?,delivery_lease_until=now()+interval '2 minutes',updated_at=now()
WHERE id=(SELECT id FROM notifications WHERE channel='EMAIL' AND status='PENDING' AND next_attempt_at<=now()
 AND (delivery_lease_until IS NULL OR delivery_lease_until<now()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING id,user_id,reference_id,subject,body
""",
                        (rs, n) ->
                                new Delivery(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("user_id", UUID.class),
                                        rs.getObject("reference_id", UUID.class),
                                        rs.getString("subject"),
                                        rs.getString("body"),
                                        owner),
                        owner);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Transactional
    public boolean renew(Delivery d) {
        return db.update(
                        "UPDATE notifications SET delivery_lease_until=now()+interval '2 minutes'"
                                + " WHERE id=? AND delivery_owner=? AND status='PENDING'",
                        d.id(),
                        d.owner())
                == 1;
    }

    @Transactional
    public void sent(Delivery d) {
        db.update(
                "UPDATE notifications SET"
                    + " status='SENT',sent_at=now(),last_error=NULL,delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now()"
                    + " WHERE id=? AND delivery_owner=? AND status='PENDING'",
                d.id(),
                d.owner());
    }

    @Transactional
    public void failed(Delivery d, String error) {
        db.update(
                """
UPDATE notifications SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'FAILED' ELSE 'PENDING' END,
 last_error=?,next_attempt_at=now()+least(300,power(2,least(attempts+1,8))) * interval '1 second',
 delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now()
WHERE id=? AND delivery_owner=? AND status='PENDING'
""",
                error.substring(0, Math.min(1000, error.length())),
                d.id(),
                d.owner());
    }
}
