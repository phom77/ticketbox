package org.ticketbox.catalog.concert.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.ReadCache;
import org.ticketbox.catalog.concert.application.dto.SalePublication;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore.Review;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore.State;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.domain.Concert;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ConcertPublicationReview {
    public enum Decision { APPROVE, REQUEST_CHANGES, REJECT }

    private final ConcertRepository concerts;
    private final ConcertPublicationStore reviews;
    private final ConcertService concertService;
    private final ReadCache cache;

    public ConcertPublicationReview(ConcertRepository concerts, ConcertPublicationStore reviews,
                                    ConcertService concertService, ReadCache cache) {
        this.concerts = concerts;
        this.reviews = reviews;
        this.concertService = concertService;
        this.cache = cache;
    }

    public SalePublication status(UUID id, UUID organization) {
        var concert = concerts.findById(id).orElseThrow(ConcertPublicationReview::notFound);
        verifyScope(concert, organization);
        return status(concert);
    }

    public List<Review> queue() {
        return reviews.queue();
    }

    public List<UUID> due() {
        return reviews.due(OffsetDateTime.now());
    }

    @Transactional
    public SalePublication submit(UUID id, UUID organization, UUID actor, OffsetDateTime publishAt) {
        var concert = lock(id);
        verifyScope(concert, organization);
        boolean revision = requireReviewable(concert);
        boolean resumeHold = isReviewHold(concert);
        validateSchedule(concert, publishAt, OffsetDateTime.now(), revision);
        var readiness = concertService.publication(concert);
        if (!readiness.issues().isEmpty()) throw invalid("error.concert.publication-incomplete");
        var current = reviews.current(id).orElse(null);
        if (current != null && (current.state() == State.SUBMITTED || current.state() == State.SCHEDULED)) {
            if (current.publishAt().isEqual(publishAt) && reviews.matches(current.id())) return status(concert);
            reviews.transition(current.id(), State.SUPERSEDED);
        }
        reviews.submit(UUID.randomUUID(), id, actor, publishAt, resumeHold);
        return status(concert);
    }

    @Transactional
    public SalePublication decide(UUID id, UUID revision, UUID reviewer, Decision decision, String reason) {
        var concert = lock(id);
        var review = requireCurrent(id, revision);
        State target = switch (decision) {
            case APPROVE -> State.SCHEDULED;
            case REQUEST_CHANGES -> State.CHANGES_REQUESTED;
            case REJECT -> State.REJECTED;
        };
        if (Objects.equals(review.reviewerId(), reviewer)
                && (review.state() == target || (target == State.SCHEDULED && review.state() == State.RELEASED))) {
            return status(concert);
        }
        boolean edit = requireReviewable(concert);
        if (review.state() != State.SUBMITTED || !reviews.matches(revision)) {
            throw invalid("error.concert.review-stale");
        }
        if (target == State.SCHEDULED) {
            validateSchedule(concert, review.publishAt(), OffsetDateTime.now(), edit);
            if (!concertService.publication(concert).issues().isEmpty()) {
                throw invalid("error.concert.publication-incomplete");
            }
        } else {
            requireReason(reason);
        }
        reviews.decide(revision, target, reviewer, reason == null ? null : reason.strip());
        return status(concert);
    }

    @Transactional
    public SalePublication hold(UUID id, UUID revision, UUID actor, String reason) {
        requireReason(reason);
        var concert = lock(id);
        var review = requireCurrent(id, revision);
        if (review.state() == State.HELD) return status(concert);
        boolean live = isLive(concert);
        if (!live && review.state() != State.SCHEDULED) {
            throw invalid("error.concert.review-stale");
        }
        if (live) {
            concert.suspendSales();
            concerts.saveAndFlush(concert);
            cache.evictAfterCommit(id);
        }
        reviews.hold(revision, actor, reason.strip());
        return status(concert);
    }

    @Transactional
    public void release(UUID id) {
        var concert = concerts.findByIdForUpdate(id).orElse(null);
        if (concert == null) return;
        var review = reviews.current(id).orElse(null);
        var now = OffsetDateTime.now();
        if (review == null || review.state() != State.SCHEDULED || now.isBefore(review.publishAt())) return;
        boolean edit = review.proposedEdit() != null;
        boolean expectedState = review.resumeHold() ? isReviewHold(concert)
                : edit ? isLive(concert) : concert.getStatus() == Concert.Status.DRAFT;
        if (!expectedState || !reviews.matches(review.id())) {
            reviews.transition(review.id(), State.SUPERSEDED);
            return;
        }
        if (!concert.getEventDate().isAfter(now)
                || (concert.getSaleEndAt() != null && !concert.getSaleEndAt().isAfter(now))) {
            reviews.transition(review.id(), State.MISSED);
            return;
        }
        var readiness = concertService.publication(concert);
        if (!readiness.issues().isEmpty()
                || readiness.versions().ticketingVersion() < readiness.versions().version()) return;
        if (edit) {
            concertService.applyReviewedEdit(concert, review.proposedEdit());
            reviews.clearStagedEdit(id);
        }
        if (review.resumeHold() || !edit) {
            if (review.resumeHold()) concert.resumeSales(concert.getResumedAdmissionAt());
            else concert.changeStatus(Concert.Status.ON_SALE);
            concerts.saveAndFlush(concert);
            reviews.recordActivation(id);
            cache.evictAfterCommit(id);
        }
        reviews.transition(review.id(), State.RELEASED);
    }

    private SalePublication status(Concert concert) {
        var readiness = concertService.publication(concert);
        var review = reviews.current(concert.getId()).orElse(null);
        if (review != null && (review.state() == State.SUBMITTED || review.state() == State.SCHEDULED) && !reviews.matches(review.id())) {
            review = new Review(review.id(), review.concertId(), review.title(), State.SUPERSEDED, review.publishAt(),
                    review.saleStartAt(), review.reason(), review.reviewerId(), review.decidedAt(),
                    review.proposedEdit(), review.resumeHold());
        }
        return new SalePublication(readiness.status(), readiness.issues(), readiness.versions(), review,
                reviews.stagedEdit(concert.getId()).isPresent());
    }

    private Review requireCurrent(UUID id, UUID revision) {
        return reviews.current(id).filter(review -> review.id().equals(revision))
                .orElseThrow(() -> invalid("error.concert.review-stale"));
    }

    private Concert lock(UUID id) {
        return concerts.findByIdForUpdate(id).orElseThrow(ConcertPublicationReview::notFound);
    }

    private boolean requireReviewable(Concert concert) {
        if (concert.getStatus() == Concert.Status.DRAFT) return false;
        if (isReviewHold(concert)) return true;
        if (isLive(concert) && reviews.stagedEdit(concert.getId()).isPresent()) return true;
        throw invalid("error.concert.review-draft-required");
    }

    private static boolean isLive(Concert concert) {
        return !concert.isSalesSuspended() && isActiveSale(concert);
    }

    private boolean isReviewHold(Concert concert) {
        return concert.isSalesSuspended() && isActiveSale(concert) && reviews.releasedBefore(concert.getId())
                && reviews.current(concert.getId())
                        .filter(review -> review.state() == State.HELD || (review.resumeHold() && review.state() != State.RELEASED))
                        .isPresent();
    }

    private static boolean isActiveSale(Concert concert) {
        return concert.getStatus() == Concert.Status.ON_SALE || concert.getStatus() == Concert.Status.SOLD_OUT;
    }

    private static void validateSchedule(Concert concert, OffsetDateTime publishAt, OffsetDateTime now, boolean revision) {
        OffsetDateTime deadline = revision
                ? (concert.getSaleEndAt() == null ? concert.getEventDate() : concert.getSaleEndAt())
                : concert.getSaleStartAt();
        if (publishAt == null || !publishAt.isAfter(now)
                || (revision ? !publishAt.isBefore(deadline) : publishAt.isAfter(deadline))) {
            throw invalid(revision ? "error.concert.revision-time" : "error.concert.publication-time");
        }
    }

    private static void requireReason(String reason) {
        if (reason == null || reason.isBlank() || reason.length() > 1000) {
            throw invalid("error.concert.review-reason");
        }
    }

    private static void verifyScope(Concert concert, UUID organization) {
        if (organization != null && !organization.equals(concert.getOrganizationId())) throw notFound();
    }

    private static AppException notFound() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
    }

    private static AppException invalid(String key) {
        return new AppException(ErrorCode.INVALID_REQUEST, key);
    }
}
