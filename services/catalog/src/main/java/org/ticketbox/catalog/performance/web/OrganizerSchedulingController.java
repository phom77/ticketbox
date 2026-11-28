package org.ticketbox.catalog.performance.web;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformanceScheduling;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.application.PerformanceViews.Venue;
import org.ticketbox.catalog.performance.application.VenueLibrary;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

/** Guided scheduling: several dates at once, duplication, pricing reuse and the venue library. */
@RestController
@RequestMapping("/api/organizer/manage/v2")
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
public class OrganizerSchedulingController {
    private final PerformanceScheduling scheduling;
    private final VenueLibrary venues;

    public OrganizerSchedulingController(PerformanceScheduling scheduling, VenueLibrary venues) {
        this.scheduling = scheduling;
        this.venues = venues;
    }

    @PostMapping("/events/{id}/performances/bulk")
    public ApiResponse<List<Performance>> bulk(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody BulkRequest request) {
        return ApiResponse.success(scheduling.bulk(owner, actor(actor), id, new PerformanceScheduling.Bulk(
                request.startsAt(), request.sourcePerformanceId(), request.venueSpaceId(), request.durationMinutes(),
                request.doorsBeforeMinutes(), request.saleStartAt(), request.timezone())));
    }

    @PostMapping("/performances/{id}/duplicate")
    public ApiResponse<Performance> duplicate(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody DuplicateRequest request) {
        return ApiResponse.success(scheduling.duplicate(owner, actor(actor), id, request.startsAt()));
    }

    @PostMapping("/performances/{id}/sale/apply")
    public ApiResponse<List<PerformanceScheduling.Applied>> applyPricing(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, Principal actor,
            @RequestBody ApplyRequest request) {
        return ApiResponse.success(scheduling.applyPricing(owner, actor(actor), id, request.targets()));
    }

    @PutMapping("/venues/{id}")
    public ApiResponse<Venue> updateVenue(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody VenueEdit request) {
        return ApiResponse.success(venues.update(owner, id, new VenueLibrary.Edit(request.expectedVersion(),
                request.name(), request.address(), request.city(), request.timezone(), request.capacityHint())));
    }

    @PostMapping("/venues/{id}/spaces")
    public ApiResponse<Venue> addSpace(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody SpaceRequest request) {
        return ApiResponse.success(venues.addSpace(owner, id, request.name()));
    }

    @PutMapping("/venues/{id}/spaces/{space}")
    public ApiResponse<Venue> renameSpace(
            @PathVariable UUID id, @PathVariable UUID space,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner, @RequestBody SpaceRequest request) {
        return ApiResponse.success(venues.renameSpace(owner, id, space, request.name()));
    }

    private static UUID actor(Principal actor) {
        return UUID.fromString(actor.getName());
    }

    record BulkRequest(List<OffsetDateTime> startsAt, UUID sourcePerformanceId, UUID venueSpaceId,
                       Integer durationMinutes, Integer doorsBeforeMinutes, OffsetDateTime saleStartAt,
                       String timezone) {}
    record DuplicateRequest(OffsetDateTime startsAt) {}
    record ApplyRequest(List<PerformanceScheduling.Target> targets) {}
    record VenueEdit(Long expectedVersion, String name, String address, String city, String timezone,
                     Integer capacityHint) {}
    record SpaceRequest(String name) {}
}
