package org.ticketbox.catalog.artistbio.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.catalog.artistbio.application.ArtistBioComposerService;
import org.ticketbox.catalog.artistbio.application.ArtistBioJobService;
import org.ticketbox.catalog.artistbio.application.dto.ArtistBioJobResponse;
import org.ticketbox.catalog.artistbio.application.dto.ArtistBioJobSubmissionResponse;
import org.ticketbox.catalog.artistbio.application.dto.ComposeArtistBioRequest;
import org.ticketbox.catalog.artistbio.application.dto.UpdateArtistBioRequest;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.MultipartUpload;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping({"/api/admin", "/api/organizer/manage"})
public class ArtistBioJobController {

    private final ArtistBioJobService jobService;
    private final ArtistBioComposerService composerService;

    public ArtistBioJobController(
            ArtistBioJobService jobService, ArtistBioComposerService composerService) {
        this.jobService = jobService;
        this.composerService = composerService;
    }

    @PostMapping(
            path = "/concerts/{concertId}/artist-bio-jobs",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtistBioJobSubmissionResponse>> submit(
            @PathVariable UUID concertId,
            @RequestPart("file") MultipartFile file,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        ArtistPdfJob job =
                jobService.submit(
                        concertId,
                        new MultipartUpload(file),
                        userId(authentication),
                        organizationId,
                        isPlatformRequest(authentication, organizationId));
        return ResponseEntity.accepted().body(ApiResponse.accepted(submission(job, httpRequest)));
    }

    @GetMapping("/artist-bio-jobs/{jobId}")
    public ApiResponse<ArtistBioJobResponse> get(
            @PathVariable UUID jobId, @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        return ApiResponse.success(
                jobService.get(jobId, organizationId, isPlatformRequest(authentication, organizationId)));
    }

    @DeleteMapping("/artist-bio-jobs/{jobId}")
    public ApiResponse<Void> delete(@PathVariable UUID jobId, @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        jobService.delete(jobId, organizationId, isPlatformRequest(authentication, organizationId));
        return ApiResponse.success();
    }

    @GetMapping("/artist-bio-jobs")
    public ApiResponse<Page<ArtistBioJobResponse>> list(
            @RequestParam(required = false) UUID concertId,
            @RequestParam(required = false) ArtistPdfJob.Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        PageRequest pageable =
                PageRequest.of(
                        Math.max(page, 0),
                        Math.min(Math.max(size, 1), 100),
                        Sort.by("createdAt").descending());
        return ApiResponse.success(
                jobService.list(
                        organizationId,
                        isPlatformRequest(authentication, organizationId),
                        concertId,
                        status,
                        pageable));
    }

    @PostMapping("/artist-bio-jobs/{jobId}/retry")
    public ResponseEntity<ApiResponse<ArtistBioJobSubmissionResponse>> retry(
            @PathVariable UUID jobId,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        ArtistPdfJob job = jobService.retry(jobId, organizationId, isPlatformRequest(authentication, organizationId));
        return ResponseEntity.accepted().body(ApiResponse.accepted(submission(job, httpRequest)));
    }

    @PostMapping("/artist-bio-jobs/{jobId}/apply")
    public ApiResponse<ArtistBioJobResponse> apply(
            @PathVariable UUID jobId,
            @RequestParam(defaultValue = "false") boolean overwrite,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        return ApiResponse.success(
                jobService.apply(
                        jobId, userId(authentication), organizationId, isPlatformRequest(authentication, organizationId), overwrite));
    }

    @PostMapping("/concerts/{concertId}/artist-bio-jobs/compose")
    public ApiResponse<ArtistBioJobResponse> compose(
            @PathVariable UUID concertId,
            @Valid @RequestBody ComposeArtistBioRequest request,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        return ApiResponse.success(
                ArtistBioJobResponse.from(
                        composerService.compose(
                                concertId,
                                request.sourceJobIds(),
                                userId(authentication),
                                organizationId,
                                isPlatformRequest(authentication, organizationId))));
    }

    @PutMapping("/concerts/{concertId}/artist-bio")
    public ApiResponse<Void> publishReviewedBio(
            @PathVariable UUID concertId,
            @Valid @RequestBody UpdateArtistBioRequest request,
            @RequestAttribute(name = OrganizationAccess.ORGANIZATION, required = false) UUID organizationId,
            Authentication authentication) {
        jobService.publishReviewedBio(
                concertId, request.artistBio(), organizationId, isPlatformRequest(authentication, organizationId));
        return ApiResponse.success(null);
    }

    private ArtistBioJobSubmissionResponse submission(
            ArtistPdfJob job, HttpServletRequest request) {
        String basePath =
                request.getRequestURI().startsWith("/api/organizer/")
                        ? "/api/organizer/manage"
                        : "/api/admin";
        return new ArtistBioJobSubmissionResponse(
                job.getId(), job.getStatus().name(), basePath + "/artist-bio-jobs/" + job.getId());
    }

    private boolean isPlatformRequest(Authentication authentication, UUID organizationId) {
        return organizationId == null && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }

    private UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }

}
