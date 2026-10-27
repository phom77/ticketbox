package com.ticketbox.shared.event;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Domain event published by the payment module when a payment is successfully processed.
 * Placed in shared to break the circular dependency between the payment and ticket modules:
 * - payment module publishes this event (no longer needs to know about ticket)
 * - ticket module listens to this event (no longer causes a cycle)
 */
public record PaymentCompletedEvent(
        UUID eventId,
        UUID orderId,
        UUID userId,
        String provider,
        String providerRef,
        BigDecimal amount,
        OffsetDateTime occurredAt
) {}
