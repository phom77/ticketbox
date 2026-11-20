package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID id,
        UUID concertId,
        String concertTitle,
        String status,
        BigDecimal totalAmount,
        String paymentUrl,
        OffsetDateTime expiresAt,
        OffsetDateTime createdAt,
        List<OrderItemResponse> items,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID performanceId,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID eventId,
        @JsonInclude(JsonInclude.Include.NON_NULL) String performanceTitle,
        @JsonInclude(JsonInclude.Include.NON_NULL) String performanceVenueName,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime performanceStartsAt) {}
