package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Offer;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Review;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.State;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Summary;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.application.PerformanceViews.Publication;

@Service
@Transactional(readOnly = true)
public class PerformancePublicationReview {
    public enum Action { APPROVE, REQUEST_CHANGES, REJECT, HOLD }

    public record Status(String status, long saleVersion, boolean ticketingAcknowledged,
                         boolean checkinAcknowledged, Review review) {}

    private final PerformanceStore performances;
    private final PerformanceReviewStore reviews;
    private final PerformanceCatalog catalog;

    public PerformancePublicationReview(PerformanceStore performances, PerformanceReviewStore reviews, PerformanceCatalog catalog) {
        this.performances = performances;
        this.reviews = reviews;
        this.catalog = catalog;
    }

    @Transactional
    public Status status(UUID owner, UUID id) {
        var performance = owned(owner, id);
        return status(performances.publication(performance), reviews.current(id).orElse(null));
    }

    public List<Review> queue() {
        return reviews.queue();
    }

    public List<UUID> due() {
        return reviews.due(OffsetDateTime.now());
    }

    @Transactional
    public Status submit(UUID owner, UUID actor, UUID id, Versions versions, OffsetDateTime publishAt) {
        var performance = owned(owner, id);
        var publication = performances.publication(performance);
        var previous = reviews.current(id).orElse(null);
        if (!"DRAFT".equals(performance.status())) throw stale();
        requireSchedule(performance, publishAt);
        validate(owner, performance, versions);
        if (previous != null && (previous.state() == State.SUBMITTED || previous.state() == State.SCHEDULED)) {
            if (previous.versions().equals(versions) && previous.publishAt().isEqual(publishAt)) {
                return status(publication, previous);
            }
            reviews.transition(previous.id(), State.SUPERSEDED);
        }
        var event = catalog.event(performance.eventId(), owner);
        var offers = performances.sale(id).offers().stream().map(offer ->
                new Offer(offer.name(), offer.price(), offer.active(), offer.saleStartAt(), offer.saleEndAt())).toList();
        var snapshot = new Summary(event.title(), event.description(), performance.venueName(), performance.spaceName(),
                performance.startsAt(), performance.saleStartAt(), performance.saleEndAt(), performance.publicVisible(), offers);
        var review = new Review(UUID.randomUUID(), id, actor, publishAt, versions, snapshot, State.SUBMITTED, null, null);
        reviews.submit(review);
        return status(publication, review);
    }

    @Transactional
    public Review decide(UUID id, UUID revision, UUID actor, Action action, String reason) {
        UUID owner = performances.nativeOwner(id).orElseThrow(PerformancePublicationReview::missing);
        var performance = owned(owner, id);
        var review = reviews.current(id).filter(value -> value.id().equals(revision)).orElseThrow(PerformancePublicationReview::stale);
        var state = switch (action) {
            case APPROVE -> State.SCHEDULED;
            case REQUEST_CHANGES -> State.CHANGES_REQUESTED;
            case REJECT -> State.REJECTED;
            case HOLD -> State.HELD;
        };
        if (actor.equals(review.reviewerId()) && (review.state() == state
                || (state == State.SCHEDULED && review.state() == State.RELEASED))) return review;
        if (!"DRAFT".equals(performance.status()) || (action == Action.HOLD
                ? review.state() != State.SCHEDULED : review.state() != State.SUBMITTED)) throw stale();
        if (action == Action.APPROVE) {
            requireSchedule(performance, review.publishAt());
            validate(owner, performance, review.versions());
        } else if (reason == null || reason.isBlank() || reason.length() > 1000) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.concert.review-reason");
        }
        reviews.decide(revision, state, actor, reason == null ? null : reason.strip());
        return reviews.current(id).orElseThrow(PerformancePublicationReview::missing);
    }

    @Transactional
    public void release(UUID id) {
        var owner = performances.nativeOwner(id).orElse(null);
        if (owner == null) return;
        var performance = owned(owner, id);
        var review = reviews.current(id).orElse(null);
        var now = OffsetDateTime.now();
        if (review == null || review.state() != State.SCHEDULED || review.publishAt().isAfter(now)) return;
        if (!"DRAFT".equals(performance.status()) || !currentVersions(owner, performance).equals(review.versions())) {
            reviews.transition(review.id(), State.SUPERSEDED);
            return;
        }
        if (!performance.saleEndAt().isAfter(now)) {
            reviews.transition(review.id(), State.MISSED);
            return;
        }
        var versions = review.versions();
        catalog.publish(owner, review.submittedBy(), id, versions.sale(), versions.layout(), versions.event(), versions.schedule());
        reviews.transition(review.id(), State.RELEASED);
    }

    private Versions currentVersions(UUID owner, Performance performance) {
        var event = performances.lockNativeEventVersion(performance.eventId(), owner).orElseThrow(PerformancePublicationReview::missing);
        var layout = performances.draftLayout(performance.id()).map(PerformanceViews.Layout::version).orElse(0L);
        return new Versions(performance.saleVersion(), layout, event, performance.draftVersion());
    }

    private void validate(UUID owner, Performance performance, Versions versions) {
        if (versions == null) throw stale();
        catalog.validatePublication(owner, performance, versions.sale(), versions.layout(), versions.event(), versions.schedule());
    }

    private Performance owned(UUID owner, UUID id) {
        return performances.lockOwnedPerformance(id, owner).orElseThrow(PerformancePublicationReview::missing);
    }

    private static Status status(Publication publication, Review review) {
        return new Status(publication.status(), publication.saleVersion(), publication.ticketingAcknowledged(),
                publication.checkinAcknowledged(), review);
    }

    private static void requireSchedule(Performance performance, OffsetDateTime publishAt) {
        if (publishAt == null || !publishAt.isAfter(OffsetDateTime.now()) || publishAt.isAfter(performance.saleStartAt())) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.concert.publication-time");
        }
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }

    private static AppException stale() {
        return new AppException(ErrorCode.INVALID_REQUEST, "error.concert.review-stale");
    }
}
