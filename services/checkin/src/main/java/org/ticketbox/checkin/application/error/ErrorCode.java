package org.ticketbox.checkin.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("Yêu cầu không hợp lệ"),
    VALIDATION_FAILED("Dữ liệu chưa hợp lệ"),
    UNAUTHORIZED("Bạn không có quyền thực hiện thao tác này"),
    RESOURCE_NOT_FOUND("Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR("Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),
    INVALID_STATUS_TRANSITION("Không thể chuyển sang trạng thái này");

    private final String message;

    ErrorCode(String message) {
        this.message = message;
    }
}
