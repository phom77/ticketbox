package com.ticketbox.payments.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PaymentIntent(
        int schemaVersion,
        UUID intentId,
        UUID orderId,
        UUID userId,
        BigDecimal amount,
        String currency,
        long orderVersion,
        String requestId,
        String correlationId,
        OffsetDateTime expiresAt) {
    public PaymentIntent {
        if (schemaVersion != 1
                || orderVersion != 1
                || intentId == null
                || orderId == null
                || userId == null
                || expiresAt == null
                || amount == null
                || amount.signum() < 0
                || amount.stripTrailingZeros().scale() > 0
                || !"VND".equals(currency)
                || requestId == null
                || requestId.isBlank()
                || requestId.length() > 100
                || correlationId == null
                || correlationId.isBlank()
                || correlationId.length() > 200) {
            throw new IllegalArgumentException("Invalid payment intent");
        }
    }
}
