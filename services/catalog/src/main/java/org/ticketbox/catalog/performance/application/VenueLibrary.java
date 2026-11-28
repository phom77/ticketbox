package org.ticketbox.catalog.performance.application;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceViews.Venue;
import org.ticketbox.catalog.performance.domain.PerformanceRules;
import org.ticketbox.catalog.performance.domain.VenueCity;

/**
 * The organization's venue library: edit a venue and manage its spaces. Name and address are buyer-visible through
 * sale snapshots, orders and tickets, so they are locked while a released or in-review performance uses the venue.
 */
@Service
public class VenueLibrary {
    public static final String DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

    private final PerformanceStore store;

    public VenueLibrary(PerformanceStore store) {
        this.store = store;
    }

    public record Details(String city, String timezone, Integer capacityHint) {}

    public record Edit(Long expectedVersion, String name, String address, String city, String timezone,
                       Integer capacityHint) {}

    /** Normalizes the optional venue details; an empty city falls back to the address rule. */
    static Details details(String address, String city, String timezone, Integer capacityHint) {
        String normalizedCity = city == null || city.isBlank() ? VenueCity.of(address) : city.strip();
        require(normalizedCity == null || normalizedCity.length() <= VenueCity.MAX_LENGTH, "error.venue.invalid-city");
        String zone = timezone == null || timezone.isBlank() ? DEFAULT_TIMEZONE : timezone.strip();
        try {
            require(ZoneId.getAvailableZoneIds().contains(zone), "error.performance.invalid-timezone");
        } catch (DateTimeException invalid) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-timezone");
        }
        require(capacityHint == null || (capacityHint > 0 && capacityHint <= 1_000_000), "error.venue.invalid-capacity");
        return new Details(normalizedCity, zone, capacityHint);
    }

    @Transactional
    public Venue update(UUID owner, UUID id, Edit edit) {
        var venue = store.lockVenue(id, owner).orElseThrow(VenueLibrary::missing);
        require(edit.expectedVersion() != null, "error.venue.expected-version");
        if (edit.expectedVersion() != venue.version()) {
            throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT, "error.performance.version-conflict",
                    venue.version());
        }
        require(PerformanceRules.text(edit.name(), 500) && PerformanceRules.text(edit.address(), 1000),
                "error.performance.invalid-venue");
        String name = edit.name().strip();
        String address = edit.address().strip();
        if (!name.equals(venue.name()) || !address.equals(venue.address())) requireUnlocked(venue);
        var details = details(address, edit.city(), edit.timezone(), edit.capacityHint());
        store.updateVenue(id, name, address, details.city(), details.timezone(), details.capacityHint());
        return store.venue(id, owner).orElseThrow();
    }

    @Transactional
    public Venue addSpace(UUID owner, UUID venueId, String name) {
        var venue = store.lockVenue(venueId, owner).orElseThrow(VenueLibrary::missing);
        require(PerformanceRules.text(name, 200), "error.performance.invalid-venue");
        if (store.spaceNameTaken(venueId, name.strip(), null)) {
            throw new AppException(ErrorCode.CONFLICT, "error.venue.duplicate-space");
        }
        store.addSpace(venue.id(), UUID.randomUUID(), name.strip());
        return store.venue(venueId, owner).orElseThrow();
    }

    @Transactional
    public Venue renameSpace(UUID owner, UUID venueId, UUID space, String name) {
        var venue = store.lockVenue(venueId, owner).orElseThrow(VenueLibrary::missing);
        var current = venue.spaces().stream().filter(value -> value.id().equals(space)).findFirst()
                .orElseThrow(VenueLibrary::missing);
        require(PerformanceRules.text(name, 200), "error.performance.invalid-venue");
        if (name.strip().equals(current.name())) return venue;
        requireUnlocked(venue);
        if (store.spaceNameTaken(venueId, name.strip(), space)) {
            throw new AppException(ErrorCode.CONFLICT, "error.venue.duplicate-space");
        }
        store.renameSpace(venueId, space, name.strip());
        return store.venue(venueId, owner).orElseThrow();
    }

    private void requireUnlocked(Venue venue) {
        if (store.venueInUse(venue.id())) throw new AppException(ErrorCode.CONFLICT, "error.venue.in-use");
    }

    private static void require(boolean condition, String key) {
        if (!condition) throw new AppException(ErrorCode.INVALID_REQUEST, key);
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
