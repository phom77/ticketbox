package org.ticketbox.identity.web;

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

    @Getter(lombok.AccessLevel.NONE)
    private final Object[] messageArguments;

    private ApiResponse(int code, String message, T data, Map<String, String> details) {
        this(code, message, data, details, Instant.now(), new Object[0]);
    }

    private ApiResponse(
            int code,
            String message,
            T data,
            Map<String, String> details,
            Instant timestamp,
            Object[] messageArguments) {
        this.code = code;
        this.message = message;
        this.data = data;
        this.timestamp = timestamp;
        this.details = details;
        this.messageArguments = messageArguments;
    }

    Object[] messageArguments() {
        return messageArguments;
    }

    ApiResponse<T> withMessages(String localizedMessage, Map<String, String> localizedDetails) {
        return new ApiResponse<>(
                code, localizedMessage, data, localizedDetails, timestamp, new Object[0]);
    }

    public static <T> ApiResponse<T> errorWithArguments(
            int code, String message, Object[] arguments) {
        return new ApiResponse<>(code, message, null, null, Instant.now(), arguments);
    }

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(HttpStatus.OK.value(), "response.success", data, null);
    }

    public static <T> ApiResponse<T> created(T data) {
        return new ApiResponse<>(HttpStatus.CREATED.value(), "response.created", data, null);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null, null);
    }

    public static <T> ApiResponse<T> error(int code, String message, Map<String, String> details) {
        return new ApiResponse<>(code, message, null, details);
    }
}
