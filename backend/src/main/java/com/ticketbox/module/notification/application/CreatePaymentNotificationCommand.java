package com.ticketbox.module.notification.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record CreatePaymentNotificationCommand(
        UUID messageId,
        UUID userId,
        UUID orderId,
        BigDecimal amount,
        OffsetDateTime occurredAt
) {
}