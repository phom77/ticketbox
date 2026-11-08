package org.ticketbox.identity.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("error.invalid-request"),
    VALIDATION_FAILED("error.validation-failed"),
    UNAUTHENTICATED("error.unauthenticated"),
    RESOURCE_NOT_FOUND("error.resource-not-found"),
    INTERNAL_SERVER_ERROR("error.internal-server-error"),

    EMAIL_ALREADY_EXISTS("error.email-already-exists");

    private final String messageKey;

    ErrorCode(String messageKey) {
        this.messageKey = messageKey;
    }
}
