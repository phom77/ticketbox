package com.ticketbox.payments.application.error;

public final class PaymentRejection extends RuntimeException {
    public enum Kind {
        INVALID_REQUEST,
        MISSING_ATTEMPT,
        IDENTITY_CONFLICT,
        PROVIDER_CAPACITY
    }

    private final Kind kind;

    public PaymentRejection(Kind kind) {
        this(kind, "Payment request rejected");
    }

    public PaymentRejection(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
