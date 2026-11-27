package org.ticketbox.ticketing.reporting.web;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService.Eligible;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService.IssueResult;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService.Page;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService.StatementConflict;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;
import org.ticketbox.ticketing.web.security.OrganizerPermission.Grant;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.UUID;

/** Settlement statements (ADR 0007), for members with FINANCE. */
@RestController
@OrganizerPermission(Grant.FINANCE)
@RequestMapping("/api/organizer/statements")
public class StatementController {
    private final SettlementStatementService statements;

    public StatementController(SettlementStatementService statements) {
        this.statements = statements;
    }

    @GetMapping("/eligible")
    public ResponseEntity<ApiResponse<Page<Eligible>>> eligible(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ok(statements.eligible(organization, q, page, size));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<SettlementStatement>>> list(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) UUID eventId, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ok(statements.list(organization, eventId, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<SettlementStatement>> detail(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization, @PathVariable UUID id) {
        return ok(statements.detail(organization, id));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<IssueResult>> issue(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization, Principal principal,
            @RequestBody IssueRequest request) {
        if (request == null || request.scopeId() == null || request.expectedRevision() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        var result = statements.issue(organization, UUID.fromString(principal.getName()), request.scopeType(),
                request.scopeId(), request.expectedRevision());
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(ApiResponse.created(result));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @PathVariable UUID id, @RequestParam String format) {
        var file = statements.download(organization, id, format);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.filename(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.content().length).header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(file.content());
    }

    @ExceptionHandler(StatementConflict.class)
    ResponseEntity<ApiResponse<SettlementStatement>> conflict(StatementConflict conflict) {
        return ResponseEntity.status(409).cacheControl(CacheControl.noStore())
                .body(ApiResponse.failure(409, "error.statement.conflict", conflict.current()));
    }

    record IssueRequest(String scopeType, UUID scopeId, Integer expectedRevision) {}

    private static <T> ResponseEntity<ApiResponse<T>> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(body));
    }
}
