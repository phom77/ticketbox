package com.ticketbox.module.payment.application.gateway;

import java.math.BigDecimal;
import java.util.UUID;

public record PaymentWebhookResult(
        boolean valid,
        boolean success,
        UUID orderId,
        String providerRef,
        BigDecimal amount,
        String rawPayload,
        String failureReason,
        boolean pending
) {
    public PaymentWebhookResult(boolean valid, boolean success, UUID orderId, String providerRef,
                                BigDecimal amount, String rawPayload, String failureReason) {
        this(valid,success,orderId,providerRef,amount,rawPayload,failureReason,false);
    }
    public static PaymentWebhookResult invalid(String failureReason, String rawPayload) {
        return new PaymentWebhookResult(false, false, null, null, null, rawPayload, failureReason);
    }
}
