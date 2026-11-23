package org.ticketbox.catalog.performance.web;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.WorkspaceOperations;
import org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.*;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

@RestController
public class WorkspaceOperationsController {
    private final WorkspaceOperations operations;

    public WorkspaceOperationsController(WorkspaceOperations operations) {
        this.operations = operations;
    }

    @GetMapping("/api/admin/v2/events")
    ResponseEntity<ApiResponse<Page<EventRow>>> adminEvents(
            @ModelAttribute EventFilters filters, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return result(operations.events(null, filters, page(page, size)));
    }

    @GetMapping("/api/admin/v2/events/{id}")
    ResponseEntity<ApiResponse<EventDetailResponse>> event(@PathVariable UUID id) {
        var detail = operations.event(id);
        return result(new EventDetailResponse(detail.event(), detail.performances()));
    }

    @GetMapping("/api/organizer/manage/v2/event-directory")
    @OrganizerPermission(OrganizerPermission.Grant.EVENTS)
    ResponseEntity<ApiResponse<Page<EventRow>>> organizerEvents(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @ModelAttribute EventFilters filters,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return result(operations.events(owner, filters, page(page, size)));
    }

    @GetMapping("/api/admin/v2/operations-report")
    ResponseEntity<ApiResponse<Page<PerformanceRow>>> adminReport(
            @ModelAttribute ReportFilters filters, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return result(operations.performances(null, filters, page(page, size)));
    }

    @GetMapping("/api/organizer/manage/v2/operations-report")
    @OrganizerPermission(OrganizerPermission.Grant.EVENTS)
    ResponseEntity<ApiResponse<Page<PerformanceRow>>> organizerReport(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @ModelAttribute ReportFilters filters,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return result(operations.performances(owner, filters, page(page, size)));
    }

    @GetMapping("/api/admin/v2/review-directory")
    ResponseEntity<ApiResponse<Page<ReviewRow>>> reviews(
            @ModelAttribute ReviewFilters filters, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return result(operations.reviews(filters, page(page, size)));
    }

    private static <T> ResponseEntity<ApiResponse<T>> result(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(value));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiResponse<Void>> invalidParameter() {
        return ResponseEntity.badRequest().body(ApiResponse.error(400, ErrorCode.INVALID_REQUEST.getMessageKey()));
    }

    private static PageRequest page(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-operations-search");
        }
        return PageRequest.of(page, size);
    }

    record EventDetailResponse(@JsonUnwrapped EventRow event, List<PerformanceRow> performances) {}
}
