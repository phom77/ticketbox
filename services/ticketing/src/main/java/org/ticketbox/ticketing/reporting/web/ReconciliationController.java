package org.ticketbox.ticketing.reporting.web;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.ticketbox.ticketing.reporting.application.ReconciliationService;
import org.ticketbox.ticketing.reporting.application.ReconciliationService.DateBasis;
import org.ticketbox.ticketing.reporting.application.ReconciliationService.Report;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Filter;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.FINANCE)
public class ReconciliationController {
    private final ReconciliationService service;

    public ReconciliationController(ReconciliationService service) {
        this.service = service;
    }

    @GetMapping("/api/organizer/reconciliation")
    public ResponseEntity<ApiResponse<Report>> organizer(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) UUID concertId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(defaultValue = "ATTEMPT") DateBasis basis,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return report(service.filter(organization, false, concertId, from, to, basis), page, size);
    }

    @GetMapping("/api/admin/reconciliation")
    public ResponseEntity<ApiResponse<Report>> platform(
            @RequestParam(required = false) UUID organizationId,
            @RequestParam(defaultValue = "false") boolean unattributed,
            @RequestParam(required = false) UUID concertId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(defaultValue = "ATTEMPT") DateBasis basis,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return report(service.filter(organizationId, unattributed, concertId, from, to, basis), page, size);
    }

    @GetMapping("/api/organizer/reconciliation/export")
    public ResponseEntity<StreamingResponseBody> organizerExport(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) UUID concertId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(defaultValue = "ATTEMPT") DateBasis basis) {
        return export(service.filter(organization, false, concertId, from, to, basis));
    }

    @GetMapping("/api/admin/reconciliation/export")
    public ResponseEntity<StreamingResponseBody> platformExport(
            @RequestParam(required = false) UUID organizationId,
            @RequestParam(defaultValue = "false") boolean unattributed,
            @RequestParam(required = false) UUID concertId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(defaultValue = "ATTEMPT") DateBasis basis) {
        return export(service.filter(organizationId, unattributed, concertId, from, to, basis));
    }

    private ResponseEntity<ApiResponse<Report>> report(Filter filter, int page, int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(service.report(filter, page, size)));
    }

    private ResponseEntity<StreamingResponseBody> export(Filter filter) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=payment-reconciliation.csv")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(stream -> service.writeCsv(filter, stream));
    }
}
