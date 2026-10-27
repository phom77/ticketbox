package com.ticketbox.payments.provider;

import com.ticketbox.payments.provider.Provider;

public record PaymentInitiationResult(
        Provider provider,
        String paymentUrl,
        String providerRef,
        String rawPayload
) {}
