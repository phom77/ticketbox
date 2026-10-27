package com.ticketbox.infrastructure.rabbitmq;

import java.util.UUID;

/**
 * Message published to the {@code notification.email} queue to trigger email delivery.
 *
 * @param notificationId the ID of the EMAIL-channel {@code Notification} entity that should be delivered
 */
public record EmailNotificationMessage(UUID notificationId) {}
