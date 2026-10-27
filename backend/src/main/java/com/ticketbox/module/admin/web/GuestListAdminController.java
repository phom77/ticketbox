package com.ticketbox.module.admin.web;

import com.ticketbox.module.admin.application.BatchLogService;
import com.ticketbox.module.admin.application.GuestListImportService;
import com.ticketbox.module.admin.application.GuestListManagementService;
import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.web.dto.BatchLogResponse;
import com.ticketbox.module.admin.web.dto.GuestListEntryResponse;
import com.ticketbox.module.admin.web.dto.GuestListImportResponse;
import com.ticketbox.shared.response.ApiResponse;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin")
public class GuestListAdminController {

    private final GuestListImportService importService;
    private final GuestListManagementService managementService;
    private final BatchLogService batchLogService;
    public GuestListAdminController(
            GuestListImportService importService,
            GuestListManagementService managementService,
            BatchLogService batchLogService) {
        this.importService = importService;
        this.managementService = managementService;
        this.batchLogService = batchLogService;
    }

    @PostMapping(
            path = "/concerts/{concertId}/guest-lists/import",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<GuestListImportResponse>> importGuestList(
            @PathVariable UUID concertId,
            @RequestPart("file") MultipartFile file,
            Authentication authentication) {
        BatchLog log = importService.submitUpload(
                concertId,
                file,
                userId(authentication),
                isAdmin(authentication));
        GuestListImportResponse response = new GuestListImportResponse(
                log.getId(),
                log.getStatus().name(),
                "/api/admin/batch-logs/" + log.getId());
        return ResponseEntity.accepted().body(ApiResponse.accepted(response));
    }

    @GetMapping("/concerts/{concertId}/guest-lists")
    public ApiResponse<Page<GuestListEntryResponse>> listGuests(
            @PathVariable UUID concertId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        PageRequest pageable = PageRequest.of(
                page,
                Math.min(Math.max(size, 1), 100),
                Sort.by("fullName").ascending());
        return ApiResponse.success(managementService.list(
                concertId,
                userId(authentication),
                isAdmin(authentication),
                pageable));
    }

    @GetMapping("/batch-logs")
    public ApiResponse<Page<BatchLogResponse>> listBatchLogs(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) BatchLog.Status status,
            @RequestParam(required = false) BatchLog.Source source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        PageRequest pageable = PageRequest.of(
                page,
                Math.min(Math.max(size, 1), 100),
                Sort.by("startedAt").descending());
        return ApiResponse.success(batchLogService.list(
                userId(authentication),
                isAdmin(authentication),
                concertId,
                status,
                source,
                pageable));
    }

    @GetMapping("/batch-logs/{batchLogId}")
    public ApiResponse<BatchLogResponse> getBatchLog(
            @PathVariable UUID batchLogId,
            Authentication authentication) {
        return ApiResponse.success(batchLogService.get(
                batchLogId,
                userId(authentication),
                isAdmin(authentication)));
    }

    @PostMapping("/batch-jobs/guest-list-import/run")
    public ApiResponse<String> runImportScan() {
        importService.importAvailableFiles();
        return ApiResponse.success("Scheduled import scanning triggered successfully");
    }

    private UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}
