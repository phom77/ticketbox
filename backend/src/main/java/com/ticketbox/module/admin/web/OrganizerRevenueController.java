package com.ticketbox.module.admin.web;

import com.ticketbox.module.admin.application.OrganizerRevenueService;
import com.ticketbox.module.admin.application.RevenueReportExport;
import com.ticketbox.module.admin.application.RevenueReportExportService;
import com.ticketbox.module.admin.web.dto.OrganizerConcertResponse;
import com.ticketbox.module.admin.web.dto.RevenueSummaryResponse;
import com.ticketbox.module.admin.web.dto.SalesTrendResponse;
import com.ticketbox.module.admin.web.dto.ZoneRevenueResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.response.ApiResponse;
import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/organizer/concerts")
@RequiredArgsConstructor
public class OrganizerRevenueController {

    private final OrganizerRevenueService organizerRevenueService;
    private final RevenueReportExportService revenueReportExportService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<OrganizerConcertResponse>>> getCompletedConcerts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        UUID organizerId = getOrganizerId(authentication);
        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by("eventDate").descending());

        return ResponseEntity.ok(ApiResponse.success(
                organizerRevenueService.getCompletedConcerts(organizerId, pageable)));
    }

    @GetMapping("/{concertId}/revenue-summary")
    public ResponseEntity<ApiResponse<RevenueSummaryResponse>> getRevenueSummary(
            @PathVariable UUID concertId,
            Authentication authentication) {
        UUID organizerId = getOrganizerId(authentication);
        return ResponseEntity.ok(ApiResponse.success(
                organizerRevenueService.getRevenueSummary(concertId, organizerId)));
    }

    @GetMapping("/{concertId}/zone-revenue")
    public ResponseEntity<ApiResponse<List<ZoneRevenueResponse>>> getZoneRevenue(
            @PathVariable UUID concertId,
            Authentication authentication) {
        UUID organizerId = getOrganizerId(authentication);
        return ResponseEntity.ok(ApiResponse.success(
                organizerRevenueService.getZoneRevenue(concertId, organizerId)));
    }

    @GetMapping("/{concertId}/sales-trend")
    public ResponseEntity<ApiResponse<List<SalesTrendResponse>>> getSalesTrend(
            @PathVariable UUID concertId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "day") String groupBy,
            Authentication authentication) {
        if (!"day".equalsIgnoreCase(groupBy)) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Hiện chỉ hỗ trợ groupBy=day");
        }

        UUID organizerId = getOrganizerId(authentication);
        return ResponseEntity.ok(ApiResponse.success(
                organizerRevenueService.getDailySalesTrend(
                        concertId,
                        organizerId,
                        from,
                        to)));
    }

    @GetMapping("/{concertId}/revenue-report/export")
    public ResponseEntity<byte[]> exportRevenueReport(
            @PathVariable UUID concertId,
            @RequestParam String format,
            Authentication authentication) {
        UUID organizerId = getOrganizerId(authentication);
        RevenueReportExport report =
                revenueReportExportService.export(concertId, organizerId, format);

        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(report.filename(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(report.contentType()))
                .contentLength(report.content().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(report.content());
    }

    private UUID getOrganizerId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
