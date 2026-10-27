package com.ticketbox.module.payment.application.gateway;

import java.math.BigDecimal;

public record PaymentQueryResult(boolean verified, boolean success, String transactionId,
                                 BigDecimal amount, String rawPayload, boolean terminalFailure) {
    public PaymentQueryResult(boolean verified, boolean success, String transactionId, BigDecimal amount, String rawPayload) {
        this(verified,success,transactionId,amount,rawPayload,false);
    }
    public static PaymentQueryResult unknown() { return new PaymentQueryResult(false, false, null, null, null); }
}
