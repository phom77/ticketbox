package org.ticketbox.catalog.concert.web;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.concert.application.dto.ConcertDetailResponse;
import org.ticketbox.catalog.concert.application.dto.ConcertSeatMapResponse;
import org.ticketbox.catalog.concert.application.dto.ConcertSummaryResponse;
import org.ticketbox.catalog.sales.application.TicketTypeService;
import org.ticketbox.catalog.sales.application.dto.TicketTypeAvailabilityResponse;
import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.web.ApiResponse;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/concerts")
@RequiredArgsConstructor
public class ConcertController {

    private final ConcertService concertService;
    private final TicketTypeService ticketTypeService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<ConcertSummaryResponse>>> listConcerts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new org.ticketbox.catalog.application.error.AppException(
                    org.ticketbox.catalog.application.error.ErrorCode.INVALID_REQUEST,
                    "Phân trang không hợp lệ");
        }
        Pageable pageable = PageRequest.of(page, size, Sort.by("eventDate").ascending());

        Page<ConcertSummaryResponse> concerts = concertService.getPublicConcerts(pageable);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(concerts));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcertDetail(
            @PathVariable UUID id) {
        ConcertDetailResponse detail = concertService.getConcertDetail(id);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(detail));
    }

    @GetMapping("/{concertId}/seat-map")
    public ResponseEntity<ApiResponse<ConcertSeatMapResponse>> getConcertSeatMap(
            @PathVariable UUID concertId) {
        ConcertSeatMapResponse seatMap = concertService.getConcertSeatMap(concertId);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(seatMap));
    }

    @GetMapping("/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<List<TicketTypeResponse>>> getConcertTicketTypes(
            @PathVariable UUID concertId) {
        List<TicketTypeResponse> ticketTypes = ticketTypeService.getPublicTicketTypes(concertId);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(5)).cachePublic())
                .body(ApiResponse.success(ticketTypes));
    }

    @GetMapping("/{concertId}/availability")
    public ResponseEntity<ApiResponse<TicketTypeAvailabilityResponse>> availability(
            @PathVariable UUID concertId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(1)).cachePublic())
                .body(ApiResponse.success(ticketTypeService.getAvailability(concertId)));
    }
}
