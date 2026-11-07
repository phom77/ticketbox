package com.ticketbox.payments.domain;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

public record PaymentAttempt(
        UUID intentId,
        UUID orderId,
        Provider provider,
        String requestId,
        BigDecimal amount,
        State state,
        String transactionId) {
    public enum State {
        CREATED,
        PROCESSING,
        READY,
        UNKNOWN,
        FAILED,
        SETTLEMENT_PENDING,
        SUCCEEDED,
        RECONCILIATION_REQUIRED,
        REVIEW_REQUIRED
    }

    public enum Decision {
        ATTEMPT_MISMATCH,
        AMOUNT_MISMATCH,
        DUPLICATE,
        CONFLICT,
        PENDING,
        FAILED,
        MISSING_TRANSACTION,
        VERIFIED
    }

    public Decision assess(
            Provider receivedProvider, PaymentWebhookResult receipt, String receivedRequestId) {
        if (provider != receivedProvider
                || provider == Provider.MOMO && !requestId.equals(receivedRequestId)) {
            return Decision.ATTEMPT_MISMATCH;
        }
        if (receipt.amount() == null || amount.compareTo(receipt.amount()) != 0)
            return Decision.AMOUNT_MISMATCH;
        if (state == State.SETTLEMENT_PENDING
                || state == State.SUCCEEDED
                || state == State.RECONCILIATION_REQUIRED) {
            return Objects.equals(transactionId, receipt.providerRef()) && receipt.success()
                    ? Decision.DUPLICATE
                    : Decision.CONFLICT;
        }
        if (receipt.pending()) return Decision.PENDING;
        if (!receipt.success()) return Decision.FAILED;
        if (receipt.providerRef() == null || receipt.providerRef().isBlank())
            return Decision.MISSING_TRANSACTION;
        return Decision.VERIFIED;
    }
}
