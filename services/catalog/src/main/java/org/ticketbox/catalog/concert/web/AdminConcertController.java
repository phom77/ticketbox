package org.ticketbox.catalog.concert.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.catalog.concert.application.ConcertPosterService;
import org.ticketbox.catalog.concert.application.ConcertPublicationReview;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.concert.application.dto.SalePublication;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore.Review;
import org.ticketbox.catalog.concert.application.port.OrganizerDisplayNames;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.concert.application.dto.ConcertDetailResponse;
import org.ticketbox.catalog.concert.application.dto.CreateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.UpdateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.UpdateStatusRequest;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.MultipartUpload;

import java.util.UUID;
import java.util.List;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.CacheControl;

@RestController
@RequestMapping("/api/admin/concerts")
@RequiredArgsConstructor
public class AdminConcertController {

    private final ConcertService concertService;
    private final ConcertPosterService concertPosterService;
    private final ConcertPublicationReview publication;
    private final OrganizerDisplayNames organizations;

    record ReviewDecision(@NotNull UUID revision, @NotNull ConcertPublicationReview.Decision decision,
                          @Size(max = 1000) String reason) {}
    record PublicationHold(@NotNull UUID revision, @NotBlank @Size(max = 1000) String reason) {}

    @GetMapping("/publication-queue")
    public ResponseEntity<ApiResponse<List<Review>>> reviewQueue() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(publication.queue()));
    }

    @GetMapping("/{id}/publication")
    public ResponseEntity<ApiResponse<SalePublication>> publication(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(publication.status(id, null)));
    }

    @PostMapping("/{id}/publication")
    public ResponseEntity<ApiResponse<SalePublication>> submitPublication(@PathVariable UUID id,
            @Valid @RequestBody OrganizerConcertController.Submission request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(publication.submit(id, null, getUserId(authentication), request.publishAt())));
    }

    @PostMapping("/{id}/publication/decision")
    public ResponseEntity<ApiResponse<SalePublication>> decidePublication(@PathVariable UUID id,
            @Valid @RequestBody ReviewDecision request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(publication.decide(
                id, request.revision(), getUserId(authentication), request.decision(), request.reason())));
    }

    @PostMapping("/{id}/publication/hold")
    public ResponseEntity<ApiResponse<SalePublication>> holdPublication(@PathVariable UUID id,
            @Valid @RequestBody PublicationHold request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(publication.hold(
                id, request.revision(), getUserId(authentication), request.reason())));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<ConcertDetailResponse>>> listAllConcerts(
            @RequestParam(required = false) Concert.Status status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending().and(Sort.by("id")));
        Page<ConcertDetailResponse> concerts = concertService.searchConcerts(null, status, query, pageable);
        return ResponseEntity.ok(ApiResponse.success(concerts));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> createConcert(
            @Valid @RequestBody CreateConcertRequest request, Authentication authentication,
            @RequestParam(required = false) UUID organizationId) {
        if (organizationId != null && organizations.find(organizationId).isEmpty()) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        ConcertDetailResponse created = concertService.createConcert(request, getUserId(authentication), organizationId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcertForEdit(
            @PathVariable UUID id, Authentication authentication) {
        ConcertDetailResponse detail =
                concertService.getConcertForEdit(
                        id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(detail));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> updateConcert(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConcertRequest request,
            Authentication authentication) {
        ConcertDetailResponse updated =
                concertService.updateConcert(
                        id, request, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request,
            Authentication authentication) {
        ConcertDetailResponse updated =
                concertService.changeStatus(
                        id, request.status(), getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteConcert(
            @PathVariable UUID id, Authentication authentication) {
        concertService.deleteConcert(id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping(value = "/{id}/poster", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> replacePoster(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            Authentication authentication) {
        ConcertDetailResponse updated =
                concertPosterService.replacePoster(
                        id,
                        new MultipartUpload(file),
                        getUserId(authentication),
                        isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster uploaded"));
    }

    @DeleteMapping("/{id}/poster")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> removePoster(
            @PathVariable UUID id, Authentication authentication) {
        ConcertDetailResponse updated =
                concertPosterService.removePoster(
                        id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster removed"));
    }

    private UUID getUserId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }
}
