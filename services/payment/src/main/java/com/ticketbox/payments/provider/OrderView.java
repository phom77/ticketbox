package com.ticketbox.payments.provider;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderView(
        UUID id,
        UUID userId,
        BigDecimal totalAmount,
        String status,
        String paymentProvider,
        String paymentRef,
        String paymentUrl,
        java.time.OffsetDateTime expiresAt
 ) {
    public OrderView(UUID id, UUID userId, BigDecimal amount, String status, String provider, String ref, String url) {
        this(id, userId, amount, status, provider, ref, url, java.time.OffsetDateTime.now().plusMinutes(15));
    }
}
