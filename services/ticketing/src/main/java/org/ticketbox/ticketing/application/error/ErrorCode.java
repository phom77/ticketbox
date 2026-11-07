package org.ticketbox.ticketing.application.error;

import lombok.Getter;

@Getter
public enum ErrorCode {
    INVALID_REQUEST("Yêu cầu không hợp lệ"),
    VALIDATION_FAILED("Dữ liệu chưa hợp lệ"),
    UNAUTHENTICATED("Vui lòng đăng nhập để tiếp tục"),
    UNAUTHORIZED("Bạn không có quyền thực hiện thao tác này"),
    RESOURCE_NOT_FOUND("Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR("Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),

    DUPLICATE_IDEMPOTENCY_KEY("Yêu cầu này đã được xử lý trước đó"),
    EMAIL_ALREADY_EXISTS("Email đã được đăng ký"),
    TICKET_SOLD_OUT("Vé đã bán hết"),
    TICKET_LIMIT_EXCEEDED("Bạn đã vượt quá giới hạn mua vé"),
    PAYMENT_GATEWAY_UNAVAILABLE("Cổng thanh toán tạm thời không khả dụng"),
    AI_PROVIDER_UNAVAILABLE("Dịch vụ AI tạm thời không khả dụng"),
    IMAGE_STORAGE_UNAVAILABLE("Dịch vụ lưu trữ hình ảnh tạm thời không khả dụng"),
    ARTIST_BIO_JOB_NOT_READY("Tác vụ giới thiệu nghệ sĩ chưa sẵn sàng"),
    ARTIST_BIO_ALREADY_EXISTS("Concert đã có giới thiệu nghệ sĩ"),

    INVALID_STATUS_TRANSITION("Không thể chuyển sang trạng thái này"),
    CONCERT_NOT_DELETABLE("Chỉ có thể xóa concert ở trạng thái nháp"),
    CONCERT_HAS_TICKET_TYPES("Không thể xóa concert đã có hạng vé"),
    INVALID_DATE("Cấu hình ngày giờ không hợp lệ"),

    RATE_LIMIT_EXCEEDED("Bạn thao tác quá nhanh. Vui lòng thử lại sau"),
    REDIS_UNAVAILABLE("Hệ thống hàng chờ tạm thời không khả dụng"),

    CONCERT_NOT_FOUND("Không tìm thấy concert"),
    CONCERT_NOT_COMPLETED("Concert chưa kết thúc"),
    CONCERT_NOT_ON_SALE("Concert hiện không mở bán"),
    TICKET_TYPE_NOT_IN_CONCERT("Hạng vé không thuộc concert này"),
    SALE_NOT_OPEN("Thời gian bán vé chưa bắt đầu hoặc đã kết thúc"),
    ORDER_NOT_FOUND("Không tìm thấy đơn hàng"),
    TICKET_NOT_FOUND("Không tìm thấy vé");

    private final String message;

    ErrorCode(String message) {
        this.message = message;
    }
}
