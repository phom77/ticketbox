package com.ticketbox.notifications.infrastructure.persistence;

import com.ticketbox.notifications.application.NotificationRejection;
import com.ticketbox.notifications.application.port.NotificationQueries;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Component
public class NotificationQueryAdapter implements NotificationQueries {
    private final JdbcTemplate db;

    public NotificationQueryAdapter(JdbcTemplate db) {
        this.db = db;
    }

    private Map<String, Object> view(Map<String, Object> row) {
        Map<String, Object> value = new LinkedHashMap<>();
        for (String key :
                List.of(
                        "id",
                        "channel",
                        "event_type",
                        "subject",
                        "body",
                        "status",
                        "sent_at",
                        "read_at",
                        "created_at")) {
            String name =
                    switch (key) {
                        case "event_type" -> "eventType";
                        case "sent_at" -> "sentAt";
                        case "read_at" -> "readAt";
                        case "created_at" -> "createdAt";
                        default -> key;
                    };
            Object item = row.get(key);
            if (item instanceof java.sql.Timestamp time) item = time.toInstant();
            value.put(name, item);
        }
        value.put("read", row.get("read_at") != null);
        return value;
    }

    public Map<String, Object> list(UUID user, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || page > 1000000)
            throw new NotificationRejection(
                    NotificationRejection.Kind.INVALID_PAGE, "Invalid pagination");
        String where = user == null ? "" : " WHERE user_id=?";
        Long total =
                user == null
                        ? db.queryForObject("SELECT count(*) FROM notifications", Long.class)
                        : db.queryForObject(
                                "SELECT count(*) FROM notifications" + where, Long.class, user);
        var rows =
                user == null
                        ? db.queryForList(
                                "SELECT * FROM notifications ORDER BY created_at DESC,id LIMIT ?"
                                        + " OFFSET ?",
                                size,
                                (long) page * size)
                        : db.queryForList(
                                "SELECT * FROM notifications"
                                        + where
                                        + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                                user,
                                size,
                                (long) page * size);
        return Map.of(
                "content",
                rows.stream().map(this::view).toList(),
                "number",
                page,
                "size",
                size,
                "totalElements",
                total,
                "totalPages",
                (total + size - 1) / size,
                "first",
                page == 0,
                "last",
                ((long) page + 1) * size >= total,
                "empty",
                rows.isEmpty());
    }

    public long unread(UUID userId) {
        return db.queryForObject(
                "SELECT count(*) FROM notifications WHERE user_id=? AND channel='APP' AND read_at"
                        + " IS NULL",
                Long.class,
                userId);
    }

    @Transactional
    public Map<String, Object> markRead(UUID id, UUID userId) {
        var rows =
                db.queryForList(
                        "UPDATE notifications SET read_at=coalesce(read_at,now()),updated_at=now()"
                                + " WHERE id=? AND user_id=? RETURNING *",
                        id,
                        userId);
        if (rows.isEmpty())
            throw new NotificationRejection(
                    NotificationRejection.Kind.MISSING_NOTIFICATION, "Request rejected");
        return view(rows.getFirst());
    }

    @Transactional
    public Map<String, Object> retry(UUID id, UUID actorId) {
        var rows =
                db.queryForList(
                        "UPDATE notifications SET"
                            + " status='PENDING',attempts=0,last_error=NULL,next_attempt_at=now(),delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now()"
                            + " WHERE id=? AND channel='EMAIL' AND status IN ('FAILED','SKIPPED')"
                            + " RETURNING *",
                        id);
        if (rows.isEmpty())
            throw new NotificationRejection(
                    NotificationRejection.Kind.NOT_RETRYABLE,
                    "Only terminal unsent email can be retried");
        db.update(
                "INSERT INTO notification_audit(notification_id,actor_id,action)"
                        + " VALUES(?,?,'RETRY_REQUESTED')",
                id,
                actorId);
        return view(rows.getFirst());
    }
}
