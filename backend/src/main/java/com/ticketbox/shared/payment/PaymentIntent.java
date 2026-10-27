package com.ticketbox.shared.payment;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Versioned wire snapshot. Never take amount, user or deadline from the browser. */
public record PaymentIntent(int schemaVersion, UUID intentId, UUID orderId, UUID userId,
        String provider, BigDecimal amount, String currency, OffsetDateTime expiresAt,
        long orderVersion, String requestId, String correlationId) {}
