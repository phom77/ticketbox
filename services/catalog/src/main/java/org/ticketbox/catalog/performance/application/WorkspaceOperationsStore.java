package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface WorkspaceOperationsStore {
    /** Lifecycle filters of the event directory; PREPARING is the older alias for draft, in review or changes requested. */
    enum EventStatus { PREPARING, DRAFT, IN_REVIEW, CHANGES_REQUESTED, SCHEDULED, ON_SALE, SOLD_OUT, PAST, CANCELLED }
    enum ReportStatus { DRAFT, ON_SALE, SOLD_OUT, CANCELLED, COMPLETED, ON_SALE_NOW, UPCOMING }
    enum ReviewStatus { ALL, SUBMITTED, SCHEDULED, CHANGES_REQUESTED, REJECTED, HELD, RELEASED, MISSED }
    enum ReviewModel { LEGACY, PERFORMANCE }

    record EventRow(UUID id, String title, String description, String category, UUID organizationId,
                    UUID legacyConcertId, long performanceCount, boolean preparing, boolean changesRequested,
                    OffsetDateTime nextStartsAt, UUID actionPerformanceId, String changeReason, String posterUrl,
                    String status, boolean contentChangeInReview) {}

    record PerformanceRow(UUID id, UUID eventId, String title, UUID organizationId, UUID legacyConcertId,
                          String venueName, String spaceName, OffsetDateTime startsAt, OffsetDateTime endsAt,
                          String timezone, String status, boolean salesSuspended, boolean publicVisible,
                          OffsetDateTime saleStartAt, OffsetDateTime saleEndAt, String publicationStatus,
                          Boolean ticketingAcknowledged, Boolean checkinAcknowledged) {}

    record ReviewRow(UUID id, UUID revision, ReviewModel model, UUID eventId, UUID performanceId,
                     UUID legacyConcertId, UUID organizationId, String title, ReviewStatus status,
                     OffsetDateTime submittedAt, OffsetDateTime publishAt, String reason) {}

    record EventFilters(String query, EventStatus status, UUID organizationId) {}

    record ReportFilters(UUID organizationId, UUID eventId, UUID performanceId, UUID concertId, ReportStatus status,
                         OffsetDateTime from, OffsetDateTime to, OffsetDateTime asOf) {}

    record ReviewFilters(UUID organizationId, UUID eventId, UUID performanceId, UUID concertId, ReviewStatus status,
                         String query) {}

    Page<EventRow> events(EventFilters filters, Pageable page);

    Optional<EventRow> event(UUID id);

    List<PerformanceRow> eventPerformances(UUID eventId);

    Page<PerformanceRow> performances(ReportFilters filters, Pageable page);

    Page<ReviewRow> reviews(ReviewFilters filters, Pageable page);
}
