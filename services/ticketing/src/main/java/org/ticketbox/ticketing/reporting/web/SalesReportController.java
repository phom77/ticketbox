package org.ticketbox.ticketing.reporting.web;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.reporting.application.RevenueReportExport;
import org.ticketbox.ticketing.reporting.application.SalesReportService;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Breakdown;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.EventPage;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.PerformanceStatus;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Summary;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Trend;
import org.ticketbox.ticketing.reporting.application.port.SalesReportExporter;
import org.ticketbox.ticketing.web.ApiResponse;
import org.ticketbox.ticketing.web.security.OrganizationAccess;
import org.ticketbox.ticketing.web.security.OrganizerPermission;
import org.ticketbox.ticketing.web.security.OrganizerPermission.Grant;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Live organizer sales (ADR 0005). Ticket figures need EVENTS or FINANCE; money fields and exports need FINANCE. */
@RestController
@OrganizerPermission({Grant.EVENTS, Grant.FINANCE})
@RequestMapping("/api/organizer/sales")
public class SalesReportController {
    private final SalesReportService sales;
    private final SalesReportExporter exporter;

    public SalesReportController(SalesReportService sales, SalesReportExporter exporter) {
        this.sales = sales;
        this.exporter = exporter;
    }

    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<Summary>> summary(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestAttribute(OrganizationAccess.GRANTS) Set<String> grants,
            @RequestParam(required = false) UUID eventId, @RequestParam(required = false) UUID performanceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ok(sales.summary(organization, eventId, performanceId, from, to, finance(grants)));
    }

    @GetMapping("/trend")
    public ResponseEntity<ApiResponse<Trend>> trend(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestAttribute(OrganizationAccess.GRANTS) Set<String> grants,
            @RequestParam(required = false) UUID eventId, @RequestParam(required = false) UUID performanceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String groupBy) {
        return ok(sales.trend(organization, eventId, performanceId, from, to, groupBy, finance(grants)));
    }

    @GetMapping("/breakdown")
    public ResponseEntity<ApiResponse<Breakdown>> breakdown(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestAttribute(OrganizationAccess.GRANTS) Set<String> grants,
            @RequestParam(required = false) UUID eventId, @RequestParam(required = false) UUID performanceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "performance") String by) {
        return ok(sales.breakdown(organization, eventId, performanceId, from, to, by, finance(grants)));
    }

    /** Events with performances in the organization, for choosing a report scope. */
    @GetMapping("/events")
    public ResponseEntity<ApiResponse<EventPage>> events(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ok(sales.events(organization, q, page, size));
    }

    /** Performances open for sale now, with all-time net tickets and sell-through. */
    @GetMapping("/on-sale")
    public ResponseEntity<ApiResponse<List<PerformanceStatus>>> onSale(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization) {
        return ok(sales.onSale(organization, OffsetDateTime.now()));
    }

    /** Performances starting within the next days (default 7). */
    @GetMapping("/upcoming")
    public ResponseEntity<ApiResponse<List<PerformanceStatus>>> upcoming(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(defaultValue = "7") int days) {
        return ok(sales.upcoming(organization, OffsetDateTime.now(), days));
    }

    @GetMapping("/export")
    @OrganizerPermission(Grant.FINANCE)
    public ResponseEntity<byte[]> export(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
            @RequestParam(required = false) UUID eventId, @RequestParam(required = false) UUID performanceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam String format) {
        RevenueReportExport file = exporter.export(sales.report(organization, eventId, performanceId, from, to), format);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.filename(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.content().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(file.content());
    }

    private static boolean finance(Set<String> grants) {
        return grants.contains(Grant.FINANCE.name());
    }

    private static <T> ResponseEntity<ApiResponse<T>> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(body));
    }
}
