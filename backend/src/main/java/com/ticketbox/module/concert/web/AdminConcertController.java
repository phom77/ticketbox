package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.application.ConcertPosterService;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.module.concert.web.dto.CreateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateStatusRequest;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.shared.response.ApiResponse;
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

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/concerts")
@RequiredArgsConstructor
public class AdminConcertController {

    private final ConcertService concertService;
    private final ConcertPosterService concertPosterService;


    @GetMapping
    public ResponseEntity<ApiResponse<Page<ConcertDetailResponse>>> listAllConcerts(
            @RequestParam(required = false) Concert.Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<ConcertDetailResponse> concerts = concertService.getAllConcerts(status, pageable);
        return ResponseEntity.ok(ApiResponse.success(concerts));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> createConcert(
            @Valid @RequestBody CreateConcertRequest request,
            Authentication authentication
    ) {
        UUID organizerId = UUID.fromString(authentication.getName());
        ConcertDetailResponse created = concertService.createConcert(request, organizerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcertForEdit(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        ConcertDetailResponse detail = concertService.getConcertForEdit(id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(detail));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> updateConcert(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConcertRequest request,
            Authentication authentication
    ) {
        ConcertDetailResponse updated = concertService.updateConcert(id, request, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request,
            Authentication authentication
    ) {
        ConcertDetailResponse updated = concertService.changeStatus(id, request.status(), getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteConcert(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        concertService.deleteConcert(id, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping(value = "/{id}/poster", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> replacePoster(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            Authentication authentication
    ) {
        ConcertDetailResponse updated = concertPosterService.replacePoster(
                id, file, getUserId(authentication), isAdmin(authentication));
        return ResponseEntity.ok(ApiResponse.success(updated, "Concert poster uploaded"));
    }

    @DeleteMapping("/{id}/poster")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> removePoster(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        ConcertDetailResponse updated = concertPosterService.removePoster(
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
