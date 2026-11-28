package org.ticketbox.catalog.performance.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.ticketbox.catalog.domain.DomainViolation;

/**
 * The one pending edit of a released event's content. Buyers keep the live content until a reviewer approves
 * a SUBMITTED revision. Every edit increments `revision`, so a decision about an older text is stale.
 */
public record EventContentRevision(
        UUID eventId, long revision, long baseContentVersion, EventContent content, PosterEdit poster, State state,
        UUID submittedBy, OffsetDateTime submittedAt, UUID reviewerId, OffsetDateTime decidedAt, String reason) {

    public enum State { DRAFTING, SUBMITTED, CHANGES_REQUESTED, REJECTED, APPROVED }

    public enum Action {
        APPROVE(State.APPROVED), REQUEST_CHANGES(State.CHANGES_REQUESTED), REJECT(State.REJECTED);

        private final State outcome;

        Action(State outcome) {
            this.outcome = outcome;
        }

        public State outcome() {
            return outcome;
        }
    }

    /** A staged poster: `changed` false keeps the live poster; a null url with `changed` true removes it. */
    public record PosterEdit(boolean changed, String url, String publicId) {
        public static PosterEdit unchanged() {
            return new PosterEdit(false, null, null);
        }
    }

    /** The result of a decision; `repeated` is true when the same decision was already recorded. */
    public record Decision(EventContentRevision revision, boolean repeated) {}

    public static EventContentRevision start(UUID eventId, long baseContentVersion, EventContent content, PosterEdit poster) {
        return new EventContentRevision(eventId, 1, baseContentVersion, content, poster, State.DRAFTING,
                null, null, null, null, null);
    }

    /** An edit replaces the text of any revision that is not in review; the result is a new DRAFTING revision. */
    public EventContentRevision edited(long baseContentVersion, EventContent newContent, PosterEdit newPoster) {
        if (state == State.SUBMITTED) throw conflict("error.event-content.revision-in-review");
        return new EventContentRevision(eventId, revision + 1, baseContentVersion, newContent, newPoster, State.DRAFTING,
                null, null, null, null, null);
    }

    public EventContentRevision submit(UUID actor, OffsetDateTime at) {
        if (state != State.DRAFTING) throw conflict("error.event-content.revision-not-drafting");
        return new EventContentRevision(eventId, revision, baseContentVersion, content, poster, State.SUBMITTED,
                actor, at, null, null, null);
    }

    /** Takes a submitted revision back for editing. */
    public EventContentRevision withdraw() {
        if (state != State.SUBMITTED) throw conflict("error.event-content.revision-not-submitted");
        return new EventContentRevision(eventId, revision, baseContentVersion, content, poster, State.DRAFTING,
                null, null, null, null, null);
    }

    public Decision decide(Action action, UUID reviewer, String note, long expectedRevision, OffsetDateTime at) {
        if (expectedRevision != revision) {
            throw new DomainViolation("PERFORMANCE_VERSION_CONFLICT", "error.performance.version-conflict", revision);
        }
        if (state == action.outcome()) return new Decision(this, true);
        if (state != State.SUBMITTED) throw conflict("error.event-content.revision-not-submitted");
        String reason = note == null || note.isBlank() ? null : note.strip();
        if (action != Action.APPROVE && (reason == null || reason.length() > 1000)) {
            throw new DomainViolation("VALIDATION_FAILED", "error.event-content.reason-required");
        }
        return new Decision(new EventContentRevision(eventId, revision, baseContentVersion, content, poster,
                action.outcome(), submittedBy, submittedAt, reviewer, at, action == Action.APPROVE ? null : reason), false);
    }

    private static DomainViolation conflict(String key) {
        return new DomainViolation("INVALID_STATUS_TRANSITION", key);
    }
}
