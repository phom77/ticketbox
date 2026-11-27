package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

public final class PerformanceViews {
    private PerformanceViews() {}

    /**
     * An event with the content buyers see. `translations` holds the per-language title and description; the
     * poster, bio and translations of a legacy-linked event come from its concert.
     */
    public record Event(
            UUID id, String title, String description, String segment, String primaryGenre, List<String> genres,
            long draftVersion, long contentVersion, List<Performance> performances,
            String posterUrl, Map<String, DiscoveryText> translations, String artistBio, String ageRating,
            String refundPolicy) {
        public Event withPerformances(List<Performance> value) {
            return new Event(id, title, description, segment, primaryGenre, genres, draftVersion, contentVersion, value,
                    posterUrl, translations, artistBio, ageRating, refundPolicy);
        }

        public Event withGenres(List<String> value) {
            return new Event(id, title, description, segment, primaryGenre, value, draftVersion, contentVersion,
                    performances, posterUrl, translations, artistBio, ageRating, refundPolicy);
        }

        /** Deprecated: the segment id, kept for one release for clients written against the fixed categories. */
        @JsonProperty("category")
        public String category() {
            return segment;
        }
    }

    public record DiscoveryCard(UUID id, UUID eventId, String title, String venueName, OffsetDateTime eventDate,
                                OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status, String posterUrl,
                                boolean salesSuspended, Map<String, DiscoveryText> translations, Long minPrice,
                                String city, String segment, String primaryGenre, int performanceCount) {
        /** Deprecated: the segment id, kept for one release. */
        @JsonProperty("category")
        public String category() {
            return segment;
        }
    }

    public record ConcertCategory(String category) {}

    public record SegmentCount(String id, int count) {}

    public record GenreCount(String id, String segmentId, int count) {}

    /** `categories` (segment ids) is deprecated and stays for one release. */
    public record DiscoveryFacets(List<String> cities, List<SegmentCount> segments, List<GenreCount> genres,
                                  List<String> categories) {}

    public record DiscoveryText(String title, String description) {}

    public record Performance(
            UUID id, UUID eventId, UUID venueSpaceId, String venueName, String venueAddress, String spaceName,
            OffsetDateTime startsAt, OffsetDateTime endsAt, OffsetDateTime doorsOpenAt, String timezone,
            OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status, boolean salesSuspended, OffsetDateTime resumedAdmissionAt,
            boolean publicVisible, int maxPerAccount, long saleVersion, Long layoutVersion, UUID legacyConcertId,
            long draftVersion, String venueCity) {}

    public record OperationsPerformance(
            UUID id, String title, String venueName, String spaceName, OffsetDateTime startsAt, OffsetDateTime endsAt,
            OffsetDateTime doorsOpenAt, String timezone, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt,
            String status, boolean salesSuspended, boolean ticketingAcknowledged, boolean checkinAcknowledged) {}

    /** `city` falls back to the address rule when empty; `version` guards concurrent venue edits. */
    public record Venue(UUID id, String name, String address, String city, String timezone, Integer capacityHint,
                        long version, List<Space> spaces) {}

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
            UUID legacyConcertId, List<PerformanceSale.Group> groups, List<PerformanceSale.Offer> offers,
            String segment, String primaryGenre, String city) {}
}
