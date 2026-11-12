package org.ticketbox.checkin.guestlist.web;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.checkin.guestlist.application.BatchLogService;
import org.ticketbox.checkin.guestlist.application.GuestListImportService;
import org.ticketbox.checkin.guestlist.application.GuestListManagementService;
import org.ticketbox.checkin.guestlist.application.dto.BatchLogResponse;
import org.ticketbox.checkin.guestlist.application.dto.GuestListEntryResponse;
import org.ticketbox.checkin.guestlist.application.dto.GuestListImportResponse;
import org.ticketbox.checkin.guestlist.domain.BatchLog;
import org.ticketbox.checkin.web.ApiResponse;
import org.ticketbox.checkin.web.security.OrganizationAccess;
import org.ticketbox.checkin.web.security.OrganizerPermission;
import org.ticketbox.checkin.web.MultipartUpload;

import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping("/api/organizer/manage")
public class OrganizerGuestListController {

    private final GuestListImportService importService;
    private final GuestListManagementService managementService;
    private final BatchLogService batchLogService;

    public OrganizerGuestListController(
            GuestListImportService importService,
            GuestListManagementService managementService,
            BatchLogService batchLogService) {
        this.importService = importService;
        this.managementService = managementService;
        this.batchLogService = batchLogService;
    }

    @PostMapping(
            path = "/concerts/{concertId}/guest-lists/schedule",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<GuestListImportResponse>> scheduleGuestList(
            @PathVariable UUID concertId,
            @RequestPart("file") MultipartFile file,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        BatchLog log =
                importService.queueScheduledUpload(
                        concertId, new MultipartUpload(file), organizationId);
        GuestListImportResponse response =
                new GuestListImportResponse(
                        log.getId(),
                        log.getStatus().name(),
                        "/api/organizer/manage/batch-logs/" + log.getId());
        return ResponseEntity.accepted().body(ApiResponse.accepted(response));
    }

    @GetMapping("/concerts/{concertId}/guest-lists")
    public ApiResponse<Page<GuestListEntryResponse>> listGuests(
            @PathVariable UUID concertId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        PageRequest pageable =
                PageRequest.of(
                        Math.max(page, 0),
                        Math.min(Math.max(size, 1), 100),
                        Sort.by("fullName").ascending().and(Sort.by("id")));
        return ApiResponse.success(
                managementService.list(concertId, organizationId, false, query, activeOnly, pageable));
    }

    @GetMapping("/batch-logs")
    public ApiResponse<Page<BatchLogResponse>> listBatchLogs(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) BatchLog.Status status,
            @RequestParam(required = false) BatchLog.Source source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        PageRequest pageable =
                PageRequest.of(
                        Math.max(page, 0),
                        Math.min(Math.max(size, 1), 100),
                        Sort.by("startedAt").descending());
        return ApiResponse.success(
                batchLogService.list(
                        organizationId, false, concertId, status, source, pageable));
    }

    @GetMapping("/batch-logs/{batchLogId}")
    public ApiResponse<BatchLogResponse> getBatchLog(
            @PathVariable UUID batchLogId, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ApiResponse.success(batchLogService.get(batchLogId, organizationId, false));
    }
}
