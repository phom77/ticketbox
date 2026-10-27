package com.ticketbox.shared.payment;
import java.util.UUID;
public record PaymentSnapshot(UUID attemptId, String state, String paymentUrl, String providerRef) {}
