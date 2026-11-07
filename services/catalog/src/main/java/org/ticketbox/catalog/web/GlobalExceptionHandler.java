package org.ticketbox.catalog.web;

import jakarta.validation.ConstraintViolationException;

import lombok.extern.slf4j.Slf4j;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;

import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    @org.springframework.web.bind.annotation.ExceptionHandler(
            org.ticketbox.catalog.domain.DomainViolation.class)
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> domainViolation(
            org.ticketbox.catalog.domain.DomainViolation error) {
        var code = org.ticketbox.catalog.application.error.ErrorCode.valueOf(error.rule());
        return org.springframework.http.ResponseEntity.status(ErrorHttpMapping.status(code))
                .body(ApiResponse.error(ErrorHttpMapping.status(code).value(), error.getMessage()));
    }

    @ExceptionHandler(org.springframework.web.client.RestClientResponseException.class)
    public ResponseEntity<ApiResponse<Void>> handleIntegrationResponse(
            org.springframework.web.client.RestClientResponseException ex) {
        int upstream = ex.getStatusCode().value();
        // Internal service credentials failing must not log the customer out of their valid JWT
        // session.
        int status = upstream >= 500 || upstream == 401 || upstream == 403 ? 503 : upstream;
        var response = ResponseEntity.status(status);
        if (status == 503) response.header("Retry-After", "1");
        return response.body(
                ApiResponse.error(
                        status,
                        status == 503
                                ? "Dịch vụ tạm thời chưa sẵn sàng"
                                : "Yêu cầu bị từ chối; kiểm tra trạng thái nghiệp vụ"));
    }

    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleStatus(
            org.springframework.web.server.ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(ApiResponse.error(ex.getStatusCode().value(), "Request rejected"));
    }

    @ExceptionHandler(AppException.class)
    public ResponseEntity<ApiResponse<Void>> handleAppException(AppException ex) {
        ErrorCode errorCode = ex.getErrorCode();
        ApiResponse<Void> response =
                ApiResponse.error(ErrorHttpMapping.status(errorCode).value(), ex.getMessage());
        var builder = ResponseEntity.status(ErrorHttpMapping.status(errorCode));
        if (errorCode == ErrorCode.REDIS_UNAVAILABLE
                || errorCode == ErrorCode.RATE_LIMIT_EXCEEDED) {
            builder.header("Retry-After", "1");
        }
        return builder.body(response);
    }

    @ExceptionHandler({
        org.springframework.dao.DataAccessResourceFailureException.class,
        org.springframework.data.redis.RedisSystemException.class,
        org.springframework.dao.QueryTimeoutException.class,
        org.springframework.transaction.CannotCreateTransactionException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleResourceUnavailable(RuntimeException ex) {
        return ResponseEntity.status(503)
                .header("Retry-After", "1")
                .body(ApiResponse.error(503, "Hệ thống tạm thời bận. Vui lòng thử lại sau"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(
            MethodArgumentNotValidException ex) {
        Map<String, String> details =
                ex.getBindingResult().getFieldErrors().stream()
                        .collect(
                                Collectors.toMap(
                                        FieldError::getField,
                                        fe ->
                                                Optional.ofNullable(fe.getDefaultMessage())
                                                        .orElse("Giá trị không hợp lệ"),
                                        (existing, replacement) -> existing));

        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.VALIDATION_FAILED).value(),
                        ErrorCode.VALIDATION_FAILED.getMessage(),
                        details);

        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(
            ConstraintViolationException ex) {
        Map<String, String> details =
                ex.getConstraintViolations().stream()
                        .collect(
                                Collectors.toMap(
                                        violation -> violation.getPropertyPath().toString(),
                                        violation -> violation.getMessage(),
                                        (existing, replacement) -> existing));
        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.VALIDATION_FAILED).value(),
                        ErrorCode.VALIDATION_FAILED.getMessage(),
                        details);
        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(
            HttpMessageNotReadableException ex) {
        log.warn("Malformed JSON request", ex);
        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.INVALID_REQUEST).value(),
                        "Dữ liệu JSON không hợp lệ");
        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFound(NoResourceFoundException ex) {
        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.RESOURCE_NOT_FOUND).value(),
                        "Không tìm thấy tài nguyên được yêu cầu");
        return ResponseEntity.status(ErrorHttpMapping.status(ErrorCode.RESOURCE_NOT_FOUND))
                .body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnhandledException(Exception ex) {
        log.error("Unhandled exception occurred", ex);

        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.INTERNAL_SERVER_ERROR).value(),
                        ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
        return ResponseEntity.internalServerError().body(response);
    }
}
