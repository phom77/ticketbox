package com.ticketbox.payments.domain;

public record PaymentInitiationResult(
        Provider provider, String paymentUrl, String providerRef, String rawPayload) {}
