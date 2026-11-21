package org.ticketbox.catalog.performance.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;

public record PerformanceSale(List<Group> groups, List<Offer> offers) {
    public record Group(UUID id, UUID sectionId, String sectionLabel, Kind kind, int capacity, List<Seat> seats) {}

    public record Seat(UUID id, String rowLabel, String seatLabel, boolean blocked) {}

    public record Offer(
            UUID id, UUID groupId, String name, BigDecimal price, String currency,
            OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, boolean active) {}
}
