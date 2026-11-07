package org.ticketbox.ticketing.application.error;

public class DuplicateIdempotencyKeyException extends AppException {
    public DuplicateIdempotencyKeyException(String key) {
        super(
                ErrorCode.DUPLICATE_IDEMPOTENCY_KEY,
                "Request with Idempotency-Key [" + key + "] has already been processed.");
    }
}
