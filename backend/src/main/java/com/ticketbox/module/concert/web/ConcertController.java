package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.application.TicketTypeService;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.module.concert.web.dto.ConcertSeatMapResponse;
import com.ticketbox.module.concert.web.dto.ConcertSummaryResponse;
import com.ticketbox.module.concert.web.dto.TicketTypeResponse;
import com.ticketbox.module.concert.web.dto.TicketTypeAvailabilityResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.http.CacheControl;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.time.Duration;

@RestController
@RequestMapping("/api/concerts")
@RequiredArgsConstructor
public class ConcertController {

    private final ConcertService concertService;
    private final TicketTypeService ticketTypeService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<ConcertSummaryResponse>>> listConcerts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        if (page < 0 || size < 1 || size > 100) {
            throw new com.ticketbox.shared.exception.AppException(
                    com.ticketbox.shared.exception.ErrorCode.INVALID_REQUEST, "Phân trang không hợp lệ");
        }
        Pageable pageable = PageRequest.of(page, size, Sort.by("eventDate").ascending());

        Page<ConcertSummaryResponse> concerts = concertService.getPublicConcerts(pageable);

        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(concerts));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConcertDetailResponse>> getConcertDetail(
            @PathVariable UUID id
    ) {
        ConcertDetailResponse detail = concertService.getConcertDetail(id);

        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(detail));
    }

    @GetMapping("/{concertId}/seat-map")
    public ResponseEntity<ApiResponse<ConcertSeatMapResponse>> getConcertSeatMap(
            @PathVariable UUID concertId
    ) {
        ConcertSeatMapResponse seatMap = concertService.getConcertSeatMap(concertId);

        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(15)).cachePublic())
                .body(ApiResponse.success(seatMap));
    }

    @GetMapping("/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<List<TicketTypeResponse>>> getConcertTicketTypes(
            @PathVariable UUID concertId
    ) {
        List<TicketTypeResponse> ticketTypes = ticketTypeService.getPublicTicketTypes(concertId);

        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(5)).cachePublic())
                .body(ApiResponse.success(ticketTypes));
    }

    @GetMapping("/{concertId}/availability")
    public ResponseEntity<ApiResponse<TicketTypeAvailabilityResponse>> availability(@PathVariable UUID concertId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(1)).cachePublic())
                .body(ApiResponse.success(ticketTypeService.getAvailability(concertId)));
    }
}
