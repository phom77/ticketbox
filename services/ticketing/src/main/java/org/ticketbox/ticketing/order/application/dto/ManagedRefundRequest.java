package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A refund request in the organizer or platform queue. */
public record ManagedRefundRequest(
        UUID id,
        UUID orderId,
        String orderReference,
        UUID concertId,
        String concertTitle,
        BigDecimal amount,
        String status,
        String origin,
        String reason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String decisionNote,
        OffsetDateTime createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime decidedAt,
        boolean awaitingCase) {}
