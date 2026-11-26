package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A refund request as the buyer sees it. */
public record RefundRequestView(
        UUID id,
        UUID orderId,
        String status,
        String origin,
        String reason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String decisionNote,
        OffsetDateTime createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime decidedAt,
        boolean canWithdraw) {}
