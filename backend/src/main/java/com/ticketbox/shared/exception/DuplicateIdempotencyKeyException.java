package com.ticketbox.shared.exception;

public class DuplicateIdempotencyKeyException extends AppException{
    public DuplicateIdempotencyKeyException(String key){
        super(ErrorCode.DUPLICATE_IDEMPOTENCY_KEY, "Request with Idempotency-Key [" + key + "] has already been processed.");
    }
}
