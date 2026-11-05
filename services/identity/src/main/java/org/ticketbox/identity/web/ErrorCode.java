package org.ticketbox.identity.web;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "Yêu cầu không hợp lệ"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Dữ liệu chưa hợp lệ"),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập để tiếp tục"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),

    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "Email đã được đăng ký");

    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }
}
