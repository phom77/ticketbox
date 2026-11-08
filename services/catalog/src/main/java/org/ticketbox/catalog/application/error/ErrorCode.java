package org.ticketbox.catalog.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("error.invalid-request"),
    VALIDATION_FAILED("error.validation-failed"),
    UNAUTHORIZED("error.unauthorized"),
    RESOURCE_NOT_FOUND("error.resource-not-found"),
    INTERNAL_SERVER_ERROR("error.internal-server-error"),
    AI_PROVIDER_UNAVAILABLE("error.ai-provider-unavailable"),
    IMAGE_STORAGE_UNAVAILABLE("error.image-storage-unavailable"),
    ARTIST_BIO_JOB_NOT_READY("error.artist-bio-job-not-ready"),
    ARTIST_BIO_ALREADY_EXISTS("error.artist-bio-already-exists"),
    INVALID_STATUS_TRANSITION("error.invalid-status-transition"),
    CONCERT_NOT_DELETABLE("error.concert-not-deletable"),
    INVALID_DATE("error.invalid-date"),
    RATE_LIMIT_EXCEEDED("error.rate-limit-exceeded"),
    REDIS_UNAVAILABLE("error.redis-unavailable");

    private final String messageKey;

    ErrorCode(String messageKey) {
        this.messageKey = messageKey;
    }
}
