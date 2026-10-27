package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.ConcertPosterService;
import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.module.concert.web.dto.CreateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateStatusRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/organizer/manage/concerts")
@RequiredArgsConstructor
public class OrganizerConcertController {

    private final ConcertService concertService;
    private final ConcertPosterService concertPosterService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<ConcertDetailResponse>>> listOwnedConcerts(
            @RequestParam(required = false) Concert.Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            Authentication authentication) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ResponseEntity.ok(ApiResponse.success(
                concertService.getOwnedConcerts(userId(authentication), status, pageable)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> createConcert(
            @Valid @RequestBody CreateConcertRequest request,
            Authentication authentication) {
        ConcertDetailResponse created = concertService.createConcert(request, userId(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcert(
            @PathVariable UUID id,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                concertService.getConcertForEdit(id, userId(authentication), false)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> updateConcert(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConcertRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                concertService.updateConcert(id, request, userId(authentication), false)));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(
                concertService.changeStatus(id, request.status(), userId(authentication), false)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteConcert(
            @PathVariable UUID id,
            Authentication authentication) {
        concertService.deleteConcert(id, userId(authentication), false);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping(value = "/{id}/poster", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> replacePoster(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            Authentication authentication) {
        ConcertDetailResponse updated = concertPosterService.replacePoster(
                id, file, userId(authentication), false);
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster uploaded"));
    }

    @DeleteMapping("/{id}/poster")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> removePoster(
            @PathVariable UUID id,
            Authentication authentication) {
        ConcertDetailResponse updated = concertPosterService.removePoster(
                id, userId(authentication), false);
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster removed"));
    }

    private UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
