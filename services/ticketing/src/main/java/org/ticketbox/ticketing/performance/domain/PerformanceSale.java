package org.ticketbox.ticketing.performance.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Complete, immutable Catalog sale revision. Ticketing owns live stock separately. `segment`, `primaryGenre` and `city`
 * are optional classification copies kept for future reporting; absent fields read as null and nothing uses them yet.
 */
public record PerformanceSale(
        UUID id, UUID eventId, UUID organizationId, UUID legacyConcertId, long version,
        Long layoutVersion, String layoutChecksum, String title, String venueName,
        OffsetDateTime startsAt, OffsetDateTime endsAt, OffsetDateTime doorsOpenAt, String timezone,
        OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String status, boolean salesSuspended,
        boolean publicVisible, OffsetDateTime resumedAdmissionAt, int maxPerAccount,
        List<Group> groups, List<Offer> offers, String segment, String primaryGenre, String city) {

    private static final Set<String> STATUSES =
            Set.of("ON_SALE", "SOLD_OUT", "CANCELLED", "COMPLETED");

    public enum Kind { GA, ASSIGNED }

    public record Group(UUID id, UUID sectionId, String sectionLabel, int capacity, Kind kind,
                        List<Seat> seats) {
        public Group {
            Objects.requireNonNull(id);
            requireText(sectionLabel, 500);
            Objects.requireNonNull(kind);
            seats = List.copyOf(seats);
            if (capacity < 1 || (kind == Kind.GA && !seats.isEmpty())
                    || (kind == Kind.ASSIGNED
                        && (sectionId == null || capacity != seats.stream().filter(s -> !s.blocked()).count()))) {
                throw new IllegalArgumentException("Invalid inventory group");
            }
        }
    }

    public record Seat(UUID id, String rowLabel, String seatLabel, boolean blocked) {
        public Seat {
            Objects.requireNonNull(id);
            requireText(rowLabel, 80);
            requireText(seatLabel, 80);
        }
    }

    public record Offer(UUID id, UUID groupId, String name, BigDecimal price, String currency,
                        OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, boolean active) {
        public Offer {
            Objects.requireNonNull(id);
            Objects.requireNonNull(groupId);
            requireText(name, 100);
            if (!"VND".equals(currency) || price == null || price.signum() <= 0
                    || price.stripTrailingZeros().scale() > 0
                    || price.compareTo(BigDecimal.valueOf(999_999_999_999L)) > 0
                    || saleStartAt == null || saleEndAt == null || !saleEndAt.isAfter(saleStartAt)) {
                throw new IllegalArgumentException("Invalid offer");
            }
        }
    }

    public PerformanceSale {
        Objects.requireNonNull(id);
        Objects.requireNonNull(eventId);
        Objects.requireNonNull(organizationId);
        requireText(title, 500);
        requireText(venueName, 500);
        if (timezone == null || !ZoneId.getAvailableZoneIds().contains(timezone)
                || version < 1 || maxPerAccount < 1 || maxPerAccount > 100
                || status == null || !STATUSES.contains(status)
                || startsAt == null || endsAt == null || !endsAt.isAfter(startsAt)
                || (doorsOpenAt != null && doorsOpenAt.isAfter(startsAt))
                || saleStartAt == null || saleEndAt == null || !saleEndAt.isAfter(saleStartAt)
                || (layoutVersion == null && layoutChecksum != null)
                || (layoutVersion != null && (layoutVersion < 1 || layoutChecksum == null
                      || !layoutChecksum.matches("[0-9a-f]{64}")))) {
            throw new IllegalArgumentException("Invalid performance sale");
        }
        groups = List.copyOf(groups);
        offers = List.copyOf(offers);
        if (groups.isEmpty() || offers.isEmpty()) throw new IllegalArgumentException("Incomplete sale");
        var groupIds = new HashSet<UUID>();
        var seatIds = new HashSet<UUID>();
        var gaSections = new HashSet<UUID>();
        var sectionKinds = new HashMap<UUID, Kind>();
        for (Group group : groups) {
            if (!groupIds.add(group.id())
                    || (group.kind() == Kind.GA && group.sectionId() != null && !gaSections.add(group.sectionId()))
                    || (layoutVersion == null && (group.sectionId() != null || group.kind() != Kind.GA))
                    || group.seats().stream().anyMatch(seat -> !seatIds.add(seat.id()))) {
                throw new IllegalArgumentException("Duplicate or invalid inventory group");
            }
            var previous = sectionKinds.putIfAbsent(group.sectionId(), group.kind());
            if (previous != null && previous != group.kind()) {
                throw new IllegalArgumentException("A section has more than one inventory kind");
            }
        }
        var offerIds = new HashSet<UUID>();
        for (Offer offer : offers) {
            if (!offerIds.add(offer.id()) || !groupIds.contains(offer.groupId())
                    || offer.saleStartAt().isBefore(saleStartAt) || offer.saleEndAt().isAfter(saleEndAt)) {
                throw new IllegalArgumentException("Duplicate or out-of-scope offer");
            }
        }
    }

    private static void requireText(String text, int maxLength) {
        if (text == null || text.isBlank() || text.length() > maxLength) {
            throw new IllegalArgumentException("Missing or invalid sale label");
        }
    }
}
