package com.ticketbox.module.payment.application.gateway;

import com.ticketbox.module.payment.domain.PaymentLog;

public record PaymentInitiationResult(
        PaymentLog.Provider provider,
        String paymentUrl,
        String providerRef,
        String rawPayload
) {}
