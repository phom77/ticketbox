package com.ticketbox.shared.response;


import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.Map;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    private final int code;
    private final String message;
    private final T data;
    private final Instant timestamp;
    private final Map<String, String> details;

    private ApiResponse(int code, String message, T data, Map<String, String> details) {
        this.code = code;
        this.message = message;
        this.data = data;
        this.timestamp = Instant.now();
        this.details = details;
    }

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(HttpStatus.OK.value(), "Thành công", data, null);
    }
    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(HttpStatus.OK.value(), message, data, null);
    }
    public static <T> ApiResponse<T> success() {
        return new ApiResponse<>(HttpStatus.OK.value(), "Thành công", null, null);
    }
    public static <T> ApiResponse<T> created(T data) {
        return new ApiResponse<>(HttpStatus.CREATED.value(), "Đã tạo thành công", data, null);
    }
    public static <T> ApiResponse<T> accepted(T data) {
        return new ApiResponse<>(HttpStatus.ACCEPTED.value(), "Đã tiếp nhận yêu cầu", data, null);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null, null);
    }
    public static <T> ApiResponse<T> error(int code, String message, Map<String, String> details) {
        return new ApiResponse<>(code, message, null, details);
    }
}
