package com.ticketbox.payments.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RefundResult(int schemaVersion, UUID caseId, UUID orderId, String outcome, long amount,
                           String provider, String transactionId, String reference, OffsetDateTime occurredAt,
                           boolean compensation) {}
