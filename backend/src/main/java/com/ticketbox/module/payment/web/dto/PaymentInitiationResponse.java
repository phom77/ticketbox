package com.ticketbox.module.payment.web.dto;

import java.util.UUID;

public record PaymentInitiationResponse(
        UUID orderId,
        String provider,
        String providerRef,
        String paymentUrl,
        UUID attemptId,
        String attemptState
) {}
