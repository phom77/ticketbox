package com.ticketbox.infrastructure.rabbitmq;

public final class RabbitMqNames {
    private RabbitMqNames() {
    }

    public static final String EVENTS_EXCHANGE = "ticketbox.events";
    public static final String DEAD_LETTER_EXCHANGE = "ticketbox.dlx";

    public static final String PAYMENT_SUCCEEDED_ROUTING_KEY =
            "payment.succeeded";

    public static final String PAYMENT_SUCCEEDED_QUEUE =
            "notification.payment-succeeded";

    public static final String PAYMENT_SUCCEEDED_DLQ =
            "notification.payment-succeeded.dlq";

    public static final String PAYMENT_SUCCEEDED_DLQ_ROUTING_KEY =
            "notification.payment-succeeded.dlq";

    public static final String NOTIFICATION_EMAIL_ROUTING_KEY =
            "notification.email";

    public static final String NOTIFICATION_EMAIL_QUEUE =
            "notification.email";

    public static final String NOTIFICATION_EMAIL_DLQ =
            "notification.email.dlq";

    public static final String NOTIFICATION_EMAIL_DLQ_ROUTING_KEY =
            "notification.email.dlq";
}
