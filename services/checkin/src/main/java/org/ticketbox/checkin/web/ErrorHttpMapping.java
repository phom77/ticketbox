package org.ticketbox.checkin.web;

import org.springframework.http.HttpStatus;
import org.ticketbox.checkin.application.error.ErrorCode;

public final class ErrorHttpMapping {
    private ErrorHttpMapping() {}

    public static HttpStatus status(ErrorCode code) {
        return switch (code) {
            case INVALID_REQUEST -> HttpStatus.BAD_REQUEST;
            case VALIDATION_FAILED -> HttpStatus.BAD_REQUEST;
            case UNAUTHORIZED -> HttpStatus.FORBIDDEN;
            case RESOURCE_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case INTERNAL_SERVER_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
            case INVALID_STATUS_TRANSITION -> HttpStatus.BAD_REQUEST;
        };
    }
}
