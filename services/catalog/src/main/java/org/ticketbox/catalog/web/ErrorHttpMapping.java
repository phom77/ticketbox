package org.ticketbox.catalog.web;

import org.springframework.http.HttpStatus;
import org.ticketbox.catalog.application.error.ErrorCode;

public final class ErrorHttpMapping {
    private ErrorHttpMapping() {}

    public static HttpStatus status(ErrorCode code) {
        return switch (code) {
            case INVALID_REQUEST -> HttpStatus.BAD_REQUEST;
            case VALIDATION_FAILED -> HttpStatus.BAD_REQUEST;
            case UNAUTHORIZED -> HttpStatus.FORBIDDEN;
            case RESOURCE_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case INTERNAL_SERVER_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
            case AI_PROVIDER_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case IMAGE_STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case ARTIST_BIO_JOB_NOT_READY -> HttpStatus.CONFLICT;
            case ARTIST_BIO_ALREADY_EXISTS -> HttpStatus.CONFLICT;
            case INVALID_STATUS_TRANSITION -> HttpStatus.BAD_REQUEST;
            case CONCERT_NOT_DELETABLE -> HttpStatus.CONFLICT;
            case INVALID_DATE -> HttpStatus.BAD_REQUEST;
            case RATE_LIMIT_EXCEEDED -> HttpStatus.TOO_MANY_REQUESTS;
            case REDIS_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
        };
    }
}
