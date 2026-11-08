package org.ticketbox.checkin.web;

import jakarta.validation.ConstraintViolationException;

import lombok.extern.slf4j.Slf4j;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;

import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    @org.springframework.web.bind.annotation.ExceptionHandler(
            org.ticketbox.checkin.domain.DomainViolation.class)
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> domainViolation(
            org.ticketbox.checkin.domain.DomainViolation error) {
        var code = org.ticketbox.checkin.application.error.ErrorCode.valueOf(error.rule());
        return org.springframework.http.ResponseEntity.status(ErrorHttpMapping.status(code))
                .body(ApiResponse.error(ErrorHttpMapping.status(code).value(), error.getMessage()));
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
                ApiResponse.errorWithArguments(
                        ErrorHttpMapping.status(errorCode).value(),
                        ex.getMessage(),
                        ex.messageArguments());
        return ResponseEntity.status(ErrorHttpMapping.status(errorCode)).body(response);
    }

    @ExceptionHandler({
        org.springframework.dao.DataAccessResourceFailureException.class,
        org.springframework.dao.QueryTimeoutException.class,
        org.springframework.transaction.CannotCreateTransactionException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleResourceUnavailable(RuntimeException ex) {
        return ResponseEntity.status(503)
                .header("Retry-After", "1")
                .body(ApiResponse.error(503, "error.service-busy"));
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
                                                        .orElse("error.invalid-value"),
                                        (existing, replacement) -> existing));

        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.VALIDATION_FAILED).value(),
                        ErrorCode.VALIDATION_FAILED.getMessageKey(),
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
                        ErrorCode.VALIDATION_FAILED.getMessageKey(),
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
                        "error.invalid-json");
        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFound(NoResourceFoundException ex) {
        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.RESOURCE_NOT_FOUND).value(),
                        "error.route-not-found");
        return ResponseEntity.status(ErrorHttpMapping.status(ErrorCode.RESOURCE_NOT_FOUND))
                .body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnhandledException(Exception ex) {
        log.error("Unhandled exception occurred", ex);

        ApiResponse<Void> response =
                ApiResponse.error(
                        ErrorHttpMapping.status(ErrorCode.INTERNAL_SERVER_ERROR).value(),
                        ErrorCode.INTERNAL_SERVER_ERROR.getMessageKey());
        return ResponseEntity.internalServerError().body(response);
    }
}
