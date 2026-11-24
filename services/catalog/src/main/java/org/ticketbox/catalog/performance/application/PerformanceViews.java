package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

public final class PerformanceViews {
    private PerformanceViews() {}

    public record Event(
            UUID id, String title, String description, String category, long draftVersion, List<Performance> performances) {}

    public record DiscoveryCard(UUID id, UUID eventId, String title, String venueName, OffsetDateTime eventDate,
                                OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status, String posterUrl,
                                boolean salesSuspended, Map<String, DiscoveryText> translations) {}

    public record DiscoveryText(String title, String description) {}

    public record Performance(
            UUID id, UUID eventId, UUID venueSpaceId, String venueName, String venueAddress, String spaceName,
            OffsetDateTime startsAt, OffsetDateTime endsAt, OffsetDateTime doorsOpenAt, String timezone,
            OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status, boolean salesSuspended, OffsetDateTime resumedAdmissionAt,
            boolean publicVisible, int maxPerAccount, long saleVersion, Long layoutVersion, UUID legacyConcertId,
            long draftVersion) {}

    public record OperationsPerformance(
            UUID id, String title, String venueName, String spaceName, OffsetDateTime startsAt, OffsetDateTime endsAt,
            OffsetDateTime doorsOpenAt, String timezone, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt,
            String status, boolean salesSuspended, boolean ticketingAcknowledged, boolean checkinAcknowledged) {}

    public record Venue(UUID id, String name, String address, List<Space> spaces) {}

    public record Space(UUID id, String name) {}

    public record Layout(long version, PerformanceLayout layout) {}

    public record LayoutOverview(
            long version, double width, double height, String backgroundUrl,
            List<PerformanceLayout.Shape> shapes, List<PerformanceLayout.SectionSummary> sections) {}

    public record LayoutSection(long version, PerformanceLayout.Section section) {}

    public record Template(UUID id, UUID venueSpaceId, String name, long revision, PerformanceLayout layout) {}

    public record Sale(long version, List<PerformanceSale.Group> groups, List<PerformanceSale.Offer> offers) {}

    public record Publication(String status, long saleVersion, boolean ticketingAcknowledged, boolean checkinAcknowledged) {}

    public record Background(String contentType, byte[] content) {}

    public record SaleSnapshot(
            UUID id, UUID eventId, UUID organizationId, long version, Long layoutVersion, String layoutChecksum,
            String title, String venueName, OffsetDateTime startsAt, OffsetDateTime endsAt, OffsetDateTime doorsOpenAt,
            String timezone, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status,
            boolean salesSuspended, OffsetDateTime resumedAdmissionAt, boolean publicVisible, int maxPerAccount,
            UUID legacyConcertId, List<PerformanceSale.Group> groups, List<PerformanceSale.Offer> offers) {}
}
