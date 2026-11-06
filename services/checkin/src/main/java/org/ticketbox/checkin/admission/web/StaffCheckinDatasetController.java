package org.ticketbox.checkin.admission.web;

import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.admission.web.dto.CheckinDatasetResponse;
import org.ticketbox.checkin.admission.web.dto.CheckinHistoryResponse;
import org.ticketbox.checkin.admission.web.dto.StaffConcertOverviewResponse;
import org.ticketbox.checkin.admission.web.dto.StaffConcertResponse;
import org.ticketbox.checkin.admission.web.dto.StaffTicketResponse;
import org.ticketbox.checkin.web.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@RestController
@RequestMapping("/api/staff/concerts")
@RequiredArgsConstructor
@Validated
public class StaffCheckinDatasetController {

    private final CheckinService checkinService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<StaffConcertResponse>>> getStaffConcerts(
            @RequestParam(defaultValue = "ON_SALE")
            @Pattern(regexp = "ON_SALE|SOLD_OUT|COMPLETED|CANCELLED")
            String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.ASC, "eventDate")
        );
        return ResponseEntity.ok(ApiResponse.success(
                checkinService.getStaffConcerts(status, pageable)
        ));
    }

    @GetMapping("/{concertId}/overview")
    public ResponseEntity<ApiResponse<StaffConcertOverviewResponse>> getConcertOverview(
            @PathVariable UUID concertId
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                checkinService.getStaffConcertOverview(concertId)
        ));
    }

    @GetMapping("/{concertId}/checkin-dataset")
    public ResponseEntity<ApiResponse<CheckinDatasetResponse>> getDataset(@PathVariable UUID concertId) {
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinDataset(concertId)));
    }

    @GetMapping("/{concertId}/tickets")
    public ResponseEntity<ApiResponse<Page<StaffTicketResponse>>> getTickets(
            @PathVariable UUID concertId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false)
            @Pattern(regexp = "VALID|USED|CANCELLED|TRANSFERRED")
            String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.DESC, "issuedAt")
        );
        return ResponseEntity.ok(ApiResponse.success(
                checkinService.getStaffTickets(concertId, query, status, pageable)
        ));
    }

    @GetMapping("/{concertId}/checkins")
    public ResponseEntity<ApiResponse<Page<CheckinHistoryResponse>>> getCheckinHistory(
            @PathVariable UUID concertId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.DESC, "checkedAt")
        );
        return ResponseEntity.ok(ApiResponse.success(checkinService.getCheckinHistory(concertId, pageable)));
    }
}
