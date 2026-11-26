package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.performance.application.EventContentService;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview.Status;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

@RestController
@RequestMapping("/api/organizer/manage/v2")
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
public class OrganizerPerformanceController {
    private final PerformanceCatalog catalog;

    private final PerformancePublicationReview reviews;

    private final EventContentService content;

    public OrganizerPerformanceController(
            PerformanceCatalog catalog, PerformancePublicationReview reviews, EventContentService content) {
        this.catalog = catalog;
        this.reviews = reviews;
        this.content = content;
    }

    @GetMapping("/events")
    public ApiResponse<Page<Event>> events(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.success(catalog.events(owner, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100))));
    }

    @PostMapping("/events")
    public ApiResponse<Event> createEvent(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @RequestBody EventRequest request) {
        return ApiResponse.success(content.create(owner, request.input()));
    }

    @GetMapping("/events/{id}")
    public ApiResponse<Event> event(@PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.event(id, owner));
    }

    @PutMapping("/events/{id}")
    public ApiResponse<Event> updateDraftEvent(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody EventRequest request) {
        return ApiResponse.success(content.updateDraft(owner, id, request.expectedDraftVersion(), request.input()));
    }

    @GetMapping("/venues")
    public ApiResponse<List<Venue>> venues(@RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.venues(owner));
    }

    @PostMapping("/venues")
    public ApiResponse<Venue> createVenue(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @RequestBody VenueRequest request) {
        return ApiResponse.success(catalog.createVenue(owner, request.name(), request.address(), request.spaceName()));
    }

    @PostMapping("/events/{id}/performances")
    public ApiResponse<Performance> createPerformance(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody ScheduleRequest request) {
        return ApiResponse.success(catalog.createPerformance(owner, id, request.schedule()));
    }

    @PutMapping("/performances/{id}/schedule")
    public ApiResponse<Performance> updateDraftSchedule(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody ScheduleRequest request) {
        return ApiResponse.success(catalog.updateDraftSchedule(owner, id, request.expectedDraftVersion(), request.schedule()));
    }

    @GetMapping("/performances/{id}/sale")
    public ApiResponse<Sale> sale(@PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.sale(owner, id));
    }

    @PutMapping("/performances/{id}/sale")
    public ApiResponse<Sale> saveSale(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            Principal actor, @RequestBody SaleRequest request) {
        return ApiResponse.success(catalog.saveSale(owner, actor(actor), id, request.expectedSaleVersion(),
                new PerformanceSale(request.groups(), request.offers())));
    }

    @GetMapping("/performances/{id}/publication")
    public ApiResponse<Status> publication(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(reviews.status(owner, id));
    }

    @PostMapping("/performances/{id}/publication")
    public ApiResponse<Status> submit(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @Valid @RequestBody PublishRequest request) {
        return ApiResponse.success(reviews.submit(owner, actor(actor), id,
                new Versions(request.expectedSaleVersion(), request.expectedLayoutVersion(),
                        request.expectedEventDraftVersion(), request.expectedScheduleDraftVersion()), request.publishAt()));
    }

    @GetMapping("/performances/{id}/layout")
    public ApiResponse<Layout> draft(@PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.draftLayout(owner, id));
    }

    @PutMapping("/performances/{id}/layout")
    public ApiResponse<Layout> saveDraft(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody LayoutRequest request) {
        return ApiResponse.success(catalog.saveLayout(owner, id, request.expectedVersion(), request.layout()));
    }

    @PostMapping(value = "/performances/{id}/layout/background", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Layout> uploadBackground(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestParam long expectedVersion, @RequestPart("file") MultipartFile file) {
        return ApiResponse.success(catalog.saveBackground(owner, id, expectedVersion, LayoutImages.read(file)));
    }

    @GetMapping("/performances/{id}/layout/background/{asset}")
    public ResponseEntity<byte[]> draftBackground(
            @PathVariable UUID id, @PathVariable UUID asset, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        var image = catalog.draftBackground(owner, id, asset);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }

    @GetMapping("/venues/{venue}/templates")
    public ApiResponse<List<Template>> templates(
            @PathVariable UUID venue, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.templates(owner, venue));
    }

    @PostMapping("/venues/{venue}/templates")
    public ApiResponse<Template> createTemplate(
            @PathVariable UUID venue, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody TemplateRequest request) {
        return ApiResponse.success(catalog.createTemplate(owner, venue, request.venueSpaceId(), request.name(),
                request.layout()));
    }

    @PutMapping("/venues/{venue}/templates/{template}")
    public ApiResponse<Template> reviseTemplate(
            @PathVariable UUID venue, @PathVariable UUID template,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @RequestBody LayoutRequest request) {
        return ApiResponse.success(catalog.reviseTemplate(owner, venue, template, request.expectedVersion(),
                request.layout()));
    }

    @PostMapping("/performances/{id}/layout/copy")
    public ApiResponse<Layout> copyTemplate(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody CopyRequest request) {
        return ApiResponse.success(catalog.copyTemplate(owner, id, request.templateId(), request.revision(),
                request.expectedVersion()));
    }

    private static UUID actor(Principal actor) {
        return UUID.fromString(actor.getName());
    }

    record EventRequest(String title, String description, String category, Long expectedDraftVersion,
                        Map<String, ConcertText> translations, String artistBio, String ageRating,
                        String refundPolicy) {
        EventContentService.Input input() {
            return new EventContentService.Input(
                    title, description, category, translations, artistBio, ageRating, refundPolicy);
        }
    }
    record VenueRequest(String name, String address, String spaceName) {}
    record ScheduleRequest(UUID venueSpaceId, OffsetDateTime startsAt, OffsetDateTime endsAt,
                           OffsetDateTime doorsOpenAt, String timezone, OffsetDateTime saleStartAt,
                           OffsetDateTime saleEndAt, int maxPerAccount, boolean publicVisible, Long expectedDraftVersion) {
        PerformanceCatalog.Schedule schedule() {
            return new PerformanceCatalog.Schedule(
                    venueSpaceId, startsAt, endsAt, doorsOpenAt, timezone, saleStartAt, saleEndAt, maxPerAccount, publicVisible);
        }
    }
    record SaleRequest(long expectedSaleVersion, List<PerformanceSale.Group> groups, List<PerformanceSale.Offer> offers) {}
    record PublishRequest(
            @NotNull @PositiveOrZero Long expectedSaleVersion, @NotNull @PositiveOrZero Long expectedLayoutVersion,
            @NotNull @PositiveOrZero Long expectedEventDraftVersion, @NotNull @PositiveOrZero Long expectedScheduleDraftVersion,
            @NotNull OffsetDateTime publishAt) {}
    record LayoutRequest(long expectedVersion, PerformanceLayout layout) {}
    record TemplateRequest(UUID venueSpaceId, String name, PerformanceLayout layout) {}
    record CopyRequest(UUID templateId, long revision, long expectedVersion) {}
}
