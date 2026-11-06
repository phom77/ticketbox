package org.ticketbox.ticketing.integration.payment;

public record InitiatePaymentRequest(
        String provider
) {}
