package com.ticketbox.module.ai.web;

import com.ticketbox.module.ai.application.ArtistBioJobService;
import com.ticketbox.module.ai.application.ArtistBioComposerService;
import com.ticketbox.module.ai.domain.ArtistPdfJob;
import com.ticketbox.module.ai.web.dto.ArtistBioJobResponse;
import com.ticketbox.module.ai.web.dto.ArtistBioJobSubmissionResponse;
import com.ticketbox.module.ai.web.dto.UpdateArtistBioRequest;
import com.ticketbox.module.ai.web.dto.ComposeArtistBioRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping({"/api/admin", "/api/organizer/manage"})
public class ArtistBioJobController {

    private final ArtistBioJobService jobService;
    private final ArtistBioComposerService composerService;

    public ArtistBioJobController(ArtistBioJobService jobService, ArtistBioComposerService composerService) {
        this.jobService = jobService;
        this.composerService = composerService;
    }

    @PostMapping(
            path = "/concerts/{concertId}/artist-bio-jobs",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtistBioJobSubmissionResponse>> submit(
            @PathVariable UUID concertId,
            @RequestPart("file") MultipartFile file,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        ArtistPdfJob job = jobService.submit(
                concertId,
                file,
                userId(authentication),
                isAdmin(authentication));
        return ResponseEntity.accepted().body(ApiResponse.accepted(submission(job, httpRequest)));
    }

    @GetMapping("/artist-bio-jobs/{jobId}")
    public ApiResponse<ArtistBioJobResponse> get(
            @PathVariable UUID jobId,
            Authentication authentication) {
        return ApiResponse.success(jobService.get(
                jobId,
                userId(authentication),
                isAdmin(authentication)));
    }

    @DeleteMapping("/artist-bio-jobs/{jobId}")
    public ApiResponse<Void> delete(
            @PathVariable UUID jobId,
            Authentication authentication) {
        jobService.delete(
                jobId,
                userId(authentication),
                isAdmin(authentication));
        return ApiResponse.success();
    }

    @GetMapping("/artist-bio-jobs")
    public ApiResponse<Page<ArtistBioJobResponse>> list(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) ArtistPdfJob.Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), 100),
                Sort.by("createdAt").descending());
        return ApiResponse.success(jobService.list(
                userId(authentication),
                isAdmin(authentication),
                concertId,
                status,
                pageable));
    }

    @PostMapping("/artist-bio-jobs/{jobId}/retry")
    public ResponseEntity<ApiResponse<ArtistBioJobSubmissionResponse>> retry(
            @PathVariable UUID jobId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        ArtistPdfJob job = jobService.retry(
                jobId,
                userId(authentication),
                isAdmin(authentication));
        return ResponseEntity.accepted().body(ApiResponse.accepted(submission(job, httpRequest)));
    }

    @PostMapping("/artist-bio-jobs/{jobId}/apply")
    public ApiResponse<ArtistBioJobResponse> apply(
            @PathVariable UUID jobId,
            @RequestParam(defaultValue = "false") boolean overwrite,
            Authentication authentication) {
        return ApiResponse.success(jobService.apply(
                jobId,
                userId(authentication),
                isAdmin(authentication),
                overwrite));
    }

    @PostMapping("/concerts/{concertId}/artist-bio-jobs/compose")
    public ApiResponse<ArtistBioJobResponse> compose(
            @PathVariable UUID concertId,
            @Valid @RequestBody ComposeArtistBioRequest request,
            Authentication authentication) {
        return ApiResponse.success(ArtistBioJobResponse.from(composerService.compose(
                concertId,
                request.sourceJobIds(),
                userId(authentication),
                isAdmin(authentication))));
    }

    @PutMapping("/concerts/{concertId}/artist-bio")
    public ApiResponse<Void> publishReviewedBio(
            @PathVariable UUID concertId,
            @Valid @RequestBody UpdateArtistBioRequest request,
            Authentication authentication) {
        jobService.publishReviewedBio(
                concertId,
                request.artistBio(),
                userId(authentication),
                isAdmin(authentication));
        return ApiResponse.success(null);
    }

    private ArtistBioJobSubmissionResponse submission(ArtistPdfJob job, HttpServletRequest request) {
        String basePath = request.getRequestURI().startsWith("/api/organizer/")
                ? "/api/organizer/manage"
                : "/api/admin";
        return new ArtistBioJobSubmissionResponse(
                job.getId(),
                job.getStatus().name(),
                basePath + "/artist-bio-jobs/" + job.getId());
    }

    private UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}
