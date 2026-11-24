package org.ticketbox.catalog.performance.web;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.DiscoveryQuery;
import org.ticketbox.catalog.performance.application.DiscoveryQuery.DatePreset;
import org.ticketbox.catalog.performance.application.DiscoveryQuery.SaleStatus;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.web.ApiResponse;

@RestController
@RequestMapping("/api/v2")
public class PublicPerformanceController {
    private static final CacheControl LAYOUT_CACHE = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();
    private final PerformanceCatalog catalog;

    public PublicPerformanceController(PerformanceCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/events")
    public ApiResponse<Page<Event>> events(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.success(catalog.events(null, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))));
    }

    @GetMapping("/events/discovery")
    public ApiResponse<Page<DiscoveryCard>> discover(
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "") String date,
            @RequestParam(defaultValue = "") String from, @RequestParam(defaultValue = "") String to,
            @RequestParam(defaultValue = "") String status, @RequestParam(defaultValue = "") String sort,
            @RequestParam(defaultValue = "") String city, @RequestParam(defaultValue = "") String category,
            @RequestParam(defaultValue = "") String minPrice, @RequestParam(defaultValue = "") String maxPrice,
            @RequestParam(defaultValue = "0") String page, @RequestParam(defaultValue = "24") String size) {
        var query = q.strip();
        if (query.codePointCount(0, query.length()) > 160 || query.indexOf('\0') >= 0) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-discovery-query");
        }
        var preset = switch (date) {
            case "" -> DatePreset.ANY;
            case "today" -> DatePreset.TODAY;
            case "weekend" -> DatePreset.WEEKEND;
            case "next-30" -> DatePreset.NEXT_30;
            case "custom" -> DatePreset.CUSTOM;
            default -> throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-date");
        };
        var start = discoveryDate(from);
        var end = discoveryDate(to);
        if (((start != null || end != null) && preset != DatePreset.CUSTOM)
                || (start != null && end != null && start.isAfter(end))) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-date");
        }
        var saleStatus = switch (status) {
            case "" -> null;
            case "on-sale" -> SaleStatus.ON_SALE;
            case "upcoming" -> SaleStatus.UPCOMING;
            case "sold-out" -> SaleStatus.SOLD_OUT;
            case "closed" -> SaleStatus.CLOSED;
            default -> throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-value");
        };
        if (!sort.isEmpty() && !sort.equals("sale-start")) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-value");
        }
        if (city.length() > 120 || category.length() > 120) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-value");
        }
        var lowest = price(minPrice);
        var highest = price(maxPrice);
        if (lowest != null && highest != null && lowest > highest) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-value");
        }
        PageRequest paging;
        try {
            paging = PageRequest.of(Math.max(Integer.parseInt(page), 0), Math.clamp(Integer.parseInt(size), 1, 100));
        } catch (NumberFormatException failure) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.pagination.invalid");
        }
        return ApiResponse.success(catalog.discover(DiscoveryQuery.of(query, preset, start, end, saleStatus,
                sort.equals("sale-start"), city, category, lowest, highest), paging));
    }

    @GetMapping("/events/discovery/facets")
    public ApiResponse<DiscoveryFacets> discoveryFacets() {
        return ApiResponse.success(catalog.discoveryFacets());
    }

    private static Long price(String value) {
        if (value.isEmpty()) return null;
        try {
            var parsed = Long.parseLong(value);
            if (parsed >= 0) return parsed;
        } catch (NumberFormatException failure) {
            // rejected below
        }
        throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-value");
    }

    private static LocalDate discoveryDate(String date) {
        if (date.isEmpty()) return null;
        if (date.length() == 10) {
            try {
                return LocalDate.parse(date);
            } catch (DateTimeParseException failure) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-date");
            }
        }
        throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-date");
    }

    @GetMapping("/events/{id}")
    public ApiResponse<Event> event(@PathVariable UUID id) {
        return ApiResponse.success(catalog.event(id, null));
    }

    @GetMapping("/performances/{id}/layout")
    public ResponseEntity<ApiResponse<LayoutOverview>> overview(@PathVariable UUID id) {
        var result = catalog.layoutOverview(id);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE).eTag("\"layout-" + id + "-" + result.version() + "\"")
                .body(ApiResponse.success(result));
    }

    @GetMapping("/performances/{id}/layout/sections/{section}")
    public ResponseEntity<ApiResponse<LayoutSection>> section(@PathVariable UUID id, @PathVariable UUID section) {
        var result = catalog.layoutSection(id, section);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE)
                .eTag("\"layout-" + id + "-" + result.version() + "-" + section + "\"")
                .body(ApiResponse.success(result));
    }

    @GetMapping("/performances/{id}/layout/background/{asset}")
    public ResponseEntity<byte[]> background(
            @PathVariable UUID id, @PathVariable UUID asset, @RequestParam long version) {
        var image = catalog.publishedBackground(id, version, asset);
        return ResponseEntity.ok().cacheControl(LAYOUT_CACHE)
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }
}
