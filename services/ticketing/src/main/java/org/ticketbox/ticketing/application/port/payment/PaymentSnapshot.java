package org.ticketbox.ticketing.application.port.payment;

import java.util.UUID;

public record PaymentSnapshot(
        UUID attemptId, String state, String paymentUrl, String providerRef) {}
