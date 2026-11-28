package org.ticketbox.catalog.performance.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PerformanceReviewStore {
    enum State { SUBMITTED, SCHEDULED, CHANGES_REQUESTED, REJECTED, HELD, SUPERSEDED, RELEASED, MISSED }

    record Versions(long sale, long layout, long event, long schedule) {}

    record Summary(String title, String description, String venueName, String spaceName,
                   OffsetDateTime startsAt, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt,
                   boolean publicVisible, List<Offer> offers) {}

    record Offer(String name, BigDecimal price, boolean active, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt) {}

    /** `publishAt` is empty for a release-on-approval review until it is approved. */
    record Review(UUID id, UUID performanceId, UUID submittedBy, OffsetDateTime publishAt,
                  Versions versions, Summary summary, State state, UUID reviewerId, String reason,
                  boolean releaseOnApproval) {}

    Optional<Review> current(UUID performanceId);

    List<Review> queue();

    List<UUID> due(OffsetDateTime now);

    void submit(Review review);

    /** Records the decision; a non-null `publishAt` replaces the release time (release on approval). */
    void decide(UUID id, State state, UUID reviewer, String reason, OffsetDateTime publishAt);

    void transition(UUID id, State state);
}
