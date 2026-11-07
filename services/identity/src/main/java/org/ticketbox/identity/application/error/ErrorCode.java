package org.ticketbox.identity.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("Yêu cầu không hợp lệ"),
    VALIDATION_FAILED("Dữ liệu chưa hợp lệ"),
    UNAUTHENTICATED("Vui lòng đăng nhập để tiếp tục"),
    RESOURCE_NOT_FOUND("Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR("Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),

    EMAIL_ALREADY_EXISTS("Email đã được đăng ký");

    private final String message;

    ErrorCode(String message) {
        this.message = message;
    }
}
