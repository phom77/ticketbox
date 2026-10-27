package com.ticketbox.module.ticket.web.dto;

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
    List<OrderItemResponse> items
) {}
