package org.ticketbox.ticketing.web;

import org.springframework.http.HttpStatus;
import org.ticketbox.ticketing.application.error.ErrorCode;

public final class ErrorHttpMapping {
    private ErrorHttpMapping() {}

    public static HttpStatus status(ErrorCode code) {
        return switch (code) {
            case INVALID_REQUEST -> HttpStatus.BAD_REQUEST;
            case VALIDATION_FAILED -> HttpStatus.BAD_REQUEST;
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case UNAUTHORIZED -> HttpStatus.FORBIDDEN;
            case RESOURCE_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case INTERNAL_SERVER_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
            case DUPLICATE_IDEMPOTENCY_KEY -> HttpStatus.CONFLICT;
            case EMAIL_ALREADY_EXISTS -> HttpStatus.CONFLICT;
            case TICKET_SOLD_OUT -> HttpStatus.CONFLICT;
            case TICKET_LIMIT_EXCEEDED -> HttpStatus.CONFLICT;
            case PAYMENT_GATEWAY_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case AI_PROVIDER_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case IMAGE_STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case ARTIST_BIO_JOB_NOT_READY -> HttpStatus.CONFLICT;
            case ARTIST_BIO_ALREADY_EXISTS -> HttpStatus.CONFLICT;
            case INVALID_STATUS_TRANSITION -> HttpStatus.BAD_REQUEST;
            case CONCERT_NOT_DELETABLE -> HttpStatus.CONFLICT;
            case CONCERT_HAS_TICKET_TYPES -> HttpStatus.CONFLICT;
            case INVALID_DATE -> HttpStatus.BAD_REQUEST;
            case RATE_LIMIT_EXCEEDED -> HttpStatus.TOO_MANY_REQUESTS;
            case REDIS_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case CONCERT_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case CONCERT_NOT_COMPLETED -> HttpStatus.BAD_REQUEST;
            case CONCERT_NOT_ON_SALE -> HttpStatus.BAD_REQUEST;
            case TICKET_TYPE_NOT_IN_CONCERT -> HttpStatus.BAD_REQUEST;
            case SALE_NOT_OPEN -> HttpStatus.BAD_REQUEST;
            case ORDER_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case TICKET_NOT_FOUND -> HttpStatus.NOT_FOUND;
        };
    }
}
