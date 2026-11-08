package org.ticketbox.ticketing.application.error;

public class AppException extends RuntimeException {
    private final ErrorCode errorCode;
    private final Object[] messageArguments;

    public AppException(ErrorCode errorCode) {
        this(errorCode, errorCode.getMessageKey());
    }

    public AppException(ErrorCode errorCode, String customMessage, Object... messageArguments) {
        super(customMessage);
        this.errorCode = errorCode;
        this.messageArguments = messageArguments.clone();
    }

    public Object[] messageArguments() {
        return messageArguments.clone();
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
