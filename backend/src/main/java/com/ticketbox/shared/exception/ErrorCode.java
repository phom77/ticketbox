package com.ticketbox.shared.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "Yêu cầu không hợp lệ"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Dữ liệu chưa hợp lệ"),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập để tiếp tục"),
    UNAUTHORIZED(HttpStatus.FORBIDDEN, "Bạn không có quyền thực hiện thao tác này"),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy dữ liệu được yêu cầu"),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Máy chủ đang gặp lỗi. Vui lòng thử lại sau"),

    DUPLICATE_IDEMPOTENCY_KEY(HttpStatus.CONFLICT, "Yêu cầu này đã được xử lý trước đó"),
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "Email đã được đăng ký"),
    TICKET_SOLD_OUT(HttpStatus.CONFLICT, "Vé đã bán hết"),
    TICKET_LIMIT_EXCEEDED(HttpStatus.CONFLICT, "Bạn đã vượt quá giới hạn mua vé"),
    PAYMENT_GATEWAY_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Cổng thanh toán tạm thời không khả dụng"),
    AI_PROVIDER_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ AI tạm thời không khả dụng"),
    IMAGE_STORAGE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ lưu trữ hình ảnh tạm thời không khả dụng"),
    ARTIST_BIO_JOB_NOT_READY(HttpStatus.CONFLICT, "Tác vụ giới thiệu nghệ sĩ chưa sẵn sàng"),
    ARTIST_BIO_ALREADY_EXISTS(HttpStatus.CONFLICT, "Concert đã có giới thiệu nghệ sĩ"),
    
    INVALID_STATUS_TRANSITION(HttpStatus.BAD_REQUEST, "Không thể chuyển sang trạng thái này"),
    CONCERT_NOT_DELETABLE(HttpStatus.CONFLICT, "Chỉ có thể xóa concert ở trạng thái nháp"),
    CONCERT_HAS_TICKET_TYPES(HttpStatus.CONFLICT, "Không thể xóa concert đã có hạng vé"),
    INVALID_DATE(HttpStatus.BAD_REQUEST, "Cấu hình ngày giờ không hợp lệ"),

    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "Bạn thao tác quá nhanh. Vui lòng thử lại sau"),
    REDIS_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Hệ thống hàng chờ tạm thời không khả dụng"),
    
    CONCERT_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy concert"),
    CONCERT_NOT_COMPLETED(HttpStatus.BAD_REQUEST, "Concert chưa kết thúc"),
    CONCERT_NOT_ON_SALE(HttpStatus.BAD_REQUEST, "Concert hiện không mở bán"),
    TICKET_TYPE_NOT_IN_CONCERT(HttpStatus.BAD_REQUEST, "Hạng vé không thuộc concert này"),
    SALE_NOT_OPEN(HttpStatus.BAD_REQUEST, "Thời gian bán vé chưa bắt đầu hoặc đã kết thúc"),
    ORDER_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy đơn hàng"),
    TICKET_NOT_FOUND(HttpStatus.NOT_FOUND, "Không tìm thấy vé");


    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }
}
