package org.ticketbox.catalog.performance.web;

import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformanceViews.ConcertCategory;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

/** Reads and sets the category of the event mapped to a legacy concert. */
@RestController
@RequestMapping("/api")
public class LegacyConcertCategoryController {
    private final PerformanceCatalog catalog;

    public LegacyConcertCategoryController(PerformanceCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/organizer/manage/concerts/{id}/category")
    @OrganizerPermission(OrganizerPermission.Grant.EVENTS)
    public ApiResponse<ConcertCategory> organizerCategory(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner) {
        return ApiResponse.success(catalog.legacyEventCategory(id, owner));
    }

    @PutMapping("/organizer/manage/concerts/{id}/category")
    @OrganizerPermission(OrganizerPermission.Grant.EVENTS)
    public ApiResponse<ConcertCategory> setOrganizerCategory(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID owner,
            @RequestBody CategoryRequest request) {
        return ApiResponse.success(catalog.setLegacyEventCategory(id, owner, request.category()));
    }

    @GetMapping("/admin/concerts/{id}/category")
    public ApiResponse<ConcertCategory> adminCategory(@PathVariable UUID id) {
        return ApiResponse.success(catalog.legacyEventCategory(id, null));
    }

    @PutMapping("/admin/concerts/{id}/category")
    public ApiResponse<ConcertCategory> setAdminCategory(
            @PathVariable UUID id, @RequestBody CategoryRequest request) {
        return ApiResponse.success(catalog.setLegacyEventCategory(id, null, request.category()));
    }

    record CategoryRequest(String category) {}
}
