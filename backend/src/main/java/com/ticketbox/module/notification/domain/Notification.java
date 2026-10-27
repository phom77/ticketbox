package com.ticketbox.module.notification.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Getter
@NoArgsConstructor
public class Notification extends BaseEntity {

    public enum Channel {
        EMAIL, ZALO, SMS, APP
    }

    public enum Status {
        PENDING, SENT, FAILED, SKIPPED
    }

    @Column(name = "user_id")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20)
    private Channel channel;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "subject", length = 500)
    private String subject;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.PENDING;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "attempts", nullable = false)
    private int attempts = 0;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    @Column(name = "reference_id")
    private UUID referenceId;

    public void setMessageId(UUID messageId) {
        this.messageId = messageId;
    }

    @Column(name = "message_id")
    private UUID messageId;

    public static Notification createAppNotification(
            UUID messageId,
            UUID userId,
            String eventType,
            String subject,
            String body,
            OffsetDateTime sentAt
    ) {
        Notification notification = new Notification();
        notification.messageId = messageId;
        notification.userId = userId;
        notification.channel = Channel.APP;
        notification.eventType = eventType;
        notification.subject = subject;
        notification.body = body;
        notification.status = Status.SENT;
        notification.sentAt = sentAt;
        return notification;
    }

    public static Notification createEmailNotification(
            UUID messageId,
            UUID userId,
            String eventType,
            String subject,
            String body
    ) {
        Notification notification = new Notification();
        notification.messageId = messageId;
        notification.userId = userId;
        notification.channel = Channel.EMAIL;
        notification.eventType = eventType;
        notification.subject = subject;
        notification.body = body;
        notification.status = Status.PENDING;
        return notification;
    }

    public static Notification createEmailNotification(
            UUID messageId,
            UUID userId,
            String eventType,
            String subject,
            String body,
            UUID referenceId
    ) {
        Notification notification = createEmailNotification(messageId, userId, eventType, subject, body);
        notification.referenceId = referenceId;
        return notification;
    }

    public void markAsRead(OffsetDateTime readAt) {
        if (this.readAt == null) {
            this.readAt = readAt;
        }
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public void setChannel(Channel channel) {
        this.channel = channel;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public void setSentAt(OffsetDateTime sentAt) {
        this.sentAt = sentAt;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }

    public void setReadAt(OffsetDateTime readAt) {
        this.readAt = readAt;
    }
}
