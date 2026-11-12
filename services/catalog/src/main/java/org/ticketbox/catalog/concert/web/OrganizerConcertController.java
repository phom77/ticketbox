package org.ticketbox.catalog.concert.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.catalog.concert.application.ConcertPosterService;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.concert.application.dto.ConcertDetailResponse;
import org.ticketbox.catalog.concert.application.dto.CreateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.SalePublication;
import org.ticketbox.catalog.concert.application.dto.UpdateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.UpdateStatusRequest;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;
import org.ticketbox.catalog.web.MultipartUpload;

import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping("/api/organizer/manage/concerts")
@RequiredArgsConstructor
public class OrganizerConcertController {

    private final ConcertService concertService;
    private final ConcertPosterService concertPosterService;

    @GetMapping
    @OrganizerPermission({OrganizerPermission.Grant.EVENTS, OrganizerPermission.Grant.FINANCE})
    public ResponseEntity<ApiResponse<Page<ConcertDetailResponse>>> listOwnedConcerts(
            @RequestParam(required = false) Concert.Status status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                Sort.by("createdAt").descending().and(Sort.by("id")));
        return ResponseEntity.ok(
                ApiResponse.success(
                        concertService.searchConcerts(organizationId, status, query, pageable)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> createConcert(
            @Valid @RequestBody CreateConcertRequest request, java.security.Principal actor,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        ConcertDetailResponse created =
                concertService.createConcert(request, UUID.fromString(actor.getName()), organizationId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcert(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        concertService.getConcertForEdit(id, organizationId, false)));
    }

    @GetMapping("/{id}/preview")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> preview(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(concertService.preview(id, organizationId)));
    }

    @GetMapping("/{id}/publication")
    public ResponseEntity<ApiResponse<SalePublication>> readiness(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(concertService.publication(id, organizationId)));
    }

    @PostMapping("/{id}/publication")
    public ResponseEntity<ApiResponse<SalePublication>> publish(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        var result = concertService.publish(id, organizationId);
        if (!result.issues().isEmpty()) {
            var issues = result.issues().stream().collect(
                    java.util.stream.Collectors.toMap(issue -> issue, issue -> issue));
            return ResponseEntity.unprocessableEntity()
                    .body(ApiResponse.error(422, "error.concert.publication-incomplete", issues));
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> updateConcert(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConcertRequest request,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        concertService.updateConcert(id, request, organizationId, false)));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        concertService.changeStatus(
                                id, request.status(), organizationId, false)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteConcert(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        concertService.deleteConcert(id, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping(value = "/{id}/poster", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> replacePoster(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        ConcertDetailResponse updated =
                concertPosterService.replacePoster(
                        id, new MultipartUpload(file), organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster uploaded"));
    }

    @DeleteMapping("/{id}/poster")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> removePoster(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        ConcertDetailResponse updated =
                concertPosterService.removePoster(id, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster removed"));
    }
}
