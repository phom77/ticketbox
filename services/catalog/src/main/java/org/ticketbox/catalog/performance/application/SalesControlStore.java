package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Organizer sales pauses and cancel or postpone requests of native performances. */
public interface SalesControlStore {
    /** `ticketingAcknowledged` is the acknowledgement of the latest version the pause published. */
    record Pause(UUID id, UUID performanceId, String reason, UUID pausedBy, long pauseVersion, Long resumeVersion,
                 UUID resumedBy, String closedReason, OffsetDateTime createdAt, OffsetDateTime closedAt,
                 boolean ticketingAcknowledged) {}

    record Request(UUID id, UUID performanceId, UUID organizationId, String kind, String reason,
                   OffsetDateTime proposedStartsAt, OffsetDateTime proposedEndsAt, OffsetDateTime proposedDoorsOpenAt,
                   String state, UUID requestedBy, OffsetDateTime requestedAt, UUID decidedBy,
                   OffsetDateTime decidedAt, String decisionReason, UUID disruptionId) {}

    /** A request with the performance it concerns, for the platform queue. */
    record QueueItem(Request request, String title, String venueName, OffsetDateTime startsAt, String timezone,
                     OffsetDateTime endsAt, String performanceStatus) {}

    Optional<Pause> pause(UUID id);

    Optional<Pause> openPause(UUID performance);

    Optional<Pause> latestPause(UUID performance);

    void insertPause(UUID id, UUID performance, String reason, UUID actor, long version);

    void resumePause(UUID id, long version, UUID actor);

    void supersedePause(UUID id);

    Optional<Request> request(UUID id);

    Optional<Request> openRequest(UUID performance);

    /** Newest first. */
    List<Request> requests(UUID performance);

    List<QueueItem> queue(String state);

    Optional<QueueItem> queueItem(UUID id);

    void insertRequest(Request request);

    /** Closes a requested request as DECLINED or WITHDRAWN; returns false when it was no longer requested. */
    boolean close(UUID id, String state, UUID actor, String reason);

    /** Marks a requested request ACCEPTED and links the disruption; returns false when it was no longer requested. */
    boolean accept(UUID id, UUID actor, UUID disruption);
}
