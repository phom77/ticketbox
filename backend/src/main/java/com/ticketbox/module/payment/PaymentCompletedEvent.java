package com.ticketbox.module.payment;

import java.math.BigDecimal;
import java.util.UUID;

public record PaymentCompletedEvent(
        UUID orderId,
        String provider,
        String providerRef,
        BigDecimal amount
) {}
