package org.ticketbox.ticketing.integration.payment;

import java.util.UUID;

public record PaymentInitiationResponse(
        UUID orderId,
        String provider,
        String providerRef,
        String paymentUrl,
        UUID attemptId,
        String attemptState
) {}
