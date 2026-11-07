package com.ticketbox.notifications.application;

public final class NotificationRejection extends RuntimeException {
    public enum Kind {
        INVALID_PAGE,
        MISSING_NOTIFICATION,
        NOT_RETRYABLE
    }

    private final Kind kind;

    public NotificationRejection(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
