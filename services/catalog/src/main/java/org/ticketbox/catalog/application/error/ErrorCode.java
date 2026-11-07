package org.ticketbox.catalog.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("Yêu cầu không hợp lệ"),
    VALIDATION_FAILED("Dữ liệu chưa hợp lệ"),
    UNAUTHORIZED("Bạn không có quyền thực hiện thao tác này"),
    RESOURCE_NOT_FOUND("Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR("Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),
    AI_PROVIDER_UNAVAILABLE("Dịch vụ AI tạm thời không khả dụng"),
    IMAGE_STORAGE_UNAVAILABLE("Dịch vụ lưu trữ hình ảnh tạm thời không khả dụng"),
    ARTIST_BIO_JOB_NOT_READY("Tác vụ giới thiệu nghệ sĩ chưa sẵn sàng"),
    ARTIST_BIO_ALREADY_EXISTS("Concert đã có giới thiệu nghệ sĩ"),
    INVALID_STATUS_TRANSITION("Không thể chuyển sang trạng thái này"),
    CONCERT_NOT_DELETABLE("Chỉ có thể xóa concert ở trạng thái nháp"),
    INVALID_DATE("Cấu hình ngày giờ không hợp lệ"),
    RATE_LIMIT_EXCEEDED("Bạn thao tác quá nhanh. Vui lòng thử lại sau"),
    REDIS_UNAVAILABLE("Hệ thống hàng chờ tạm thời không khả dụng");

    private final String message;

    ErrorCode(String message) {
        this.message = message;
    }
}
