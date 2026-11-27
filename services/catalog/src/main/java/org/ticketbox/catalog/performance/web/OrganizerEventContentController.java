package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import org.ticketbox.catalog.artistbio.application.ArtistBioJobService;
import org.ticketbox.catalog.artistbio.application.dto.ArtistBioJobSubmissionResponse;
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.performance.application.EventContentService;
import org.ticketbox.catalog.performance.application.EventContentService.ContentState;
import org.ticketbox.catalog.performance.application.EventDrafts;
import org.ticketbox.catalog.performance.application.PerformanceViews.Event;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.MultipartUpload;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

/** Event content, poster, reviewed revisions, preview, artist bio and draft deletion for organizers. */
@RestController
@RequestMapping("/api/organizer/manage/v2")
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
public class OrganizerEventContentController {
    private final EventContentService content;
    private final EventDrafts drafts;
    private final ArtistBioJobService bioJobs;

    public OrganizerEventContentController(
            EventContentService content, EventDrafts drafts, ArtistBioJobService bioJobs) {
        this.content = content;
        this.drafts = drafts;
        this.bioJobs = bioJobs;
    }

    @GetMapping("/events/{id}/content")
    public ResponseEntity<ApiResponse<ContentState>> state(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return noStore(content.state(owner, id));
    }

    @PutMapping("/events/{id}/content-revision")
    public ApiResponse<ContentState> stage(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody RevisionRequest request) {
        return ApiResponse.success(content.stage(owner, id, request.expectedRevision(), request.input()));
    }

    @PostMapping("/events/{id}/content-revision/submit")
    public ApiResponse<ContentState> submit(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody RevisionVersion request) {
        return ApiResponse.success(content.submit(owner, UUID.fromString(actor.getName()), id, request.expectedRevision()));
    }

    @PostMapping("/events/{id}/content-revision/withdraw")
    public ApiResponse<ContentState> withdraw(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(content.withdraw(owner, id));
    }

    @DeleteMapping("/events/{id}/content-revision")
    public ApiResponse<ContentState> discard(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(content.discard(owner, id));
    }

    @PutMapping(value = "/events/{id}/poster", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ContentState> replacePoster(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestParam(required = false) Long expectedVersion, @RequestParam(required = false) Long expectedRevision,
            @RequestPart("file") MultipartFile file) {
        return ApiResponse.success(content.replacePoster(
                owner, id, expectedVersion, expectedRevision, new MultipartUpload(file)));
    }

    @DeleteMapping("/events/{id}/poster")
    public ApiResponse<ContentState> removePoster(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestParam(required = false) Long expectedVersion, @RequestParam(required = false) Long expectedRevision) {
        return ApiResponse.success(content.removePoster(owner, id, expectedVersion, expectedRevision));
    }

    @GetMapping("/events/{id}/preview")
    public ResponseEntity<ApiResponse<Event>> preview(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestParam(defaultValue = "false") boolean revision) {
        return noStore(content.preview(owner, id, revision));
    }

    @PostMapping(value = "/events/{id}/artist-bio-jobs", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ArtistBioJobSubmissionResponse>> submitBio(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestPart("file") MultipartFile file) {
        var job = bioJobs.submitForEvent(id, new MultipartUpload(file), UUID.fromString(actor.getName()), owner, false);
        return ResponseEntity.accepted().body(ApiResponse.accepted(new ArtistBioJobSubmissionResponse(
                job.getId(), job.getStatus().name(), "/api/organizer/manage/artist-bio-jobs/" + job.getId())));
    }

    @DeleteMapping("/performances/{id}")
    public ApiResponse<Void> deletePerformance(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestParam(required = false) Long expectedDraftVersion) {
        drafts.deletePerformance(owner, UUID.fromString(actor.getName()), id, expectedDraftVersion);
        return ApiResponse.success(null);
    }

    @DeleteMapping("/events/{id}")
    public ApiResponse<Void> deleteEvent(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestParam(required = false) Long expectedDraftVersion) {
        drafts.deleteEvent(owner, UUID.fromString(actor.getName()), id, expectedDraftVersion);
        return ApiResponse.success(null);
    }

    private static <T> ResponseEntity<ApiResponse<T>> noStore(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(value));
    }

    record RevisionRequest(String title, String description, String segment, String primaryGenre, List<String> genres,
                           Map<String, ConcertText> translations, String artistBio, String ageRating,
                           String refundPolicy, Long expectedRevision) {
        EventContentService.Input input() {
            return new EventContentService.Input(title, description, null, segment, primaryGenre, genres, translations,
                    artistBio, ageRating, refundPolicy);
        }
    }

    record RevisionVersion(Long expectedRevision) {}
}
