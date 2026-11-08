package org.ticketbox.ticketing.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("error.invalid-request"),
    VALIDATION_FAILED("error.validation-failed"),
    UNAUTHENTICATED("error.unauthenticated"),
    UNAUTHORIZED("error.unauthorized"),
    RESOURCE_NOT_FOUND("error.resource-not-found"),
    INTERNAL_SERVER_ERROR("error.internal-server-error"),

    DUPLICATE_IDEMPOTENCY_KEY("error.duplicate-idempotency-key"),
    EMAIL_ALREADY_EXISTS("error.email-already-exists"),
    TICKET_SOLD_OUT("error.ticket-sold-out"),
    TICKET_LIMIT_EXCEEDED("error.ticket-limit-exceeded"),
    PAYMENT_GATEWAY_UNAVAILABLE("error.payment-gateway-unavailable"),
    AI_PROVIDER_UNAVAILABLE("error.ai-provider-unavailable"),
    IMAGE_STORAGE_UNAVAILABLE("error.image-storage-unavailable"),
    ARTIST_BIO_JOB_NOT_READY("error.artist-bio-job-not-ready"),
    ARTIST_BIO_ALREADY_EXISTS("error.artist-bio-already-exists"),

    INVALID_STATUS_TRANSITION("error.invalid-status-transition"),
    CONCERT_NOT_DELETABLE("error.concert-not-deletable"),
    CONCERT_HAS_TICKET_TYPES("error.concert-has-ticket-types"),
    INVALID_DATE("error.invalid-date"),

    RATE_LIMIT_EXCEEDED("error.rate-limit-exceeded"),
    REDIS_UNAVAILABLE("error.redis-unavailable"),

    CONCERT_NOT_FOUND("error.concert-not-found"),
    CONCERT_NOT_COMPLETED("error.concert-not-completed"),
    CONCERT_NOT_ON_SALE("error.concert-not-on-sale"),
    TICKET_TYPE_NOT_IN_CONCERT("error.ticket-type-not-in-concert"),
    SALE_NOT_OPEN("error.sale-not-open"),
    ORDER_NOT_FOUND("error.order-not-found"),
    TICKET_NOT_FOUND("error.ticket-not-found");

    private final String messageKey;

    ErrorCode(String messageKey) {
        this.messageKey = messageKey;
    }
}
