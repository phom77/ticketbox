package org.ticketbox.catalog.web;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "Yêu cầu không hợp lệ"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Dữ liệu chưa hợp lệ"),
    UNAUTHORIZED(HttpStatus.FORBIDDEN, "Bạn không có quyền thực hiện thao tác này"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),
    AI_PROVIDER_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ AI tạm thời không khả dụng"),
    IMAGE_STORAGE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ lưu trữ hình ảnh tạm thời không khả dụng"),
    ARTIST_BIO_JOB_NOT_READY(HttpStatus.CONFLICT, "Tác vụ giới thiệu nghệ sĩ chưa sẵn sàng"),
    ARTIST_BIO_ALREADY_EXISTS(HttpStatus.CONFLICT, "Concert đã có giới thiệu nghệ sĩ"),
    INVALID_STATUS_TRANSITION(HttpStatus.BAD_REQUEST, "Không thể chuyển sang trạng thái này"),
    CONCERT_NOT_DELETABLE(HttpStatus.CONFLICT, "Chỉ có thể xóa concert ở trạng thái nháp"),
    INVALID_DATE(HttpStatus.BAD_REQUEST, "Cấu hình ngày giờ không hợp lệ"),
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "Bạn thao tác quá nhanh. Vui lòng thử lại sau"),
    REDIS_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Hệ thống hàng chờ tạm thời không khả dụng");

    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }
}
