package com.ticketbox.payments.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ReconciliationSnapshot(
        int schemaVersion, UUID intentId, UUID orderId, long revision, String provider,
        String state, long requestedAmount, String transactionId, Long collectedAmount,
        OffsetDateTime attemptedAt, OffsetDateTime verifiedAt, Long refundAmount,
        String refundReference, OffsetDateTime changedAt) {}
