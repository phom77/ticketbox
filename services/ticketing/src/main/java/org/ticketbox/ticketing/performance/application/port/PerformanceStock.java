package org.ticketbox.ticketing.performance.application.port;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;

public interface PerformanceStock {
    record Sale(UUID eventId, String title, String venueName, OffsetDateTime startsAt,
                OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, boolean onSale,
                boolean suspended, boolean publicVisible, Long layoutVersion, long saleVersion,
                int maxPerAccount) {}

    record Offer(UUID id, UUID groupId, String name, String sectionLabel, Kind kind, BigDecimal price,
                 OffsetDateTime beginsAt, OffsetDateTime endsAt, boolean enabled) {
        public boolean activeAt(OffsetDateTime now) {
            return enabled && !now.isBefore(beginsAt) && now.isBefore(endsAt);
        }
    }

    record Seat(UUID id, UUID groupId, String rowLabel, String seatLabel, boolean available) {}

    record Group(UUID id, UUID sectionId, String sectionLabel, Kind kind, int available) {}

    record Scope(UUID performanceId, UUID userId) {}

    record Line(UUID offerId, UUID groupId, UUID seatId, int quantity, BigDecimal unitPrice,
                String offerName, String sectionLabel, String rowLabel, String seatLabel) {
        public Line withQuantity(int quantity) {
            return new Line(offerId, groupId, seatId, quantity, unitPrice, offerName, sectionLabel, rowLabel, seatLabel);
        }
    }

    record Hold(UUID id, String tokenHash, long version, OffsetDateTime expiresAt, List<Line> items) {}

    record Allocation(Line line, UUID orderItemId) {}

    record SavedRequest(String payloadHash, Hold hold) {}

    Optional<Sale> sale(UUID performanceId, boolean lock);

    List<Group> groups(UUID performanceId);

    List<Offer> offers(UUID performanceId);

    Optional<Seat> seat(UUID performanceId, UUID seatId);

    List<Seat> seats(UUID performanceId, UUID sectionId);

    Optional<Hold> current(Scope scope);

    int activeOrderQuantity(Scope scope);

    void replace(Scope scope, Hold hold, List<Line> previous);

    void allocate(Scope scope, Hold hold, List<Allocation> allocations);

    void releaseAllocation(UUID performanceId, UUID groupId, UUID seatId, int quantity, UUID orderItemId);

    Optional<SavedRequest> request(Scope scope, String key);

    void remember(Scope scope, String key, SavedRequest request);

    List<Scope> expiredOwners(OffsetDateTime now);
}
