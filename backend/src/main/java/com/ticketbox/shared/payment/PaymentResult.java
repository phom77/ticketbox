package com.ticketbox.shared.payment;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PaymentResult(int schemaVersion, UUID eventId, UUID intentId, UUID orderId,
        UUID userId, String provider, String requestId, BigDecimal amount, String currency,
        long orderVersion, String transactionId, OffsetDateTime occurredAt) {}
