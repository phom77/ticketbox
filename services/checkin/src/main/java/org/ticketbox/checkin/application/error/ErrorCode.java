package org.ticketbox.checkin.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("error.invalid-request"),
    VALIDATION_FAILED("error.validation-failed"),
    UNAUTHORIZED("error.unauthorized"),
    RESOURCE_NOT_FOUND("error.resource-not-found"),
    INTERNAL_SERVER_ERROR("error.internal-server-error"),
    INVALID_STATUS_TRANSITION("error.invalid-status-transition");

    private final String messageKey;

    ErrorCode(String messageKey) {
        this.messageKey = messageKey;
    }
}
