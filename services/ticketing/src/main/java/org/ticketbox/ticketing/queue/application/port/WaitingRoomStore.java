package org.ticketbox.ticketing.queue.application.port;

import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Shared waiting-room and queue state. Each operation is atomic across Ticketing workers, so the
 * use case can rely on it for ordering, admission budgets and session tokens.
 */
public interface WaitingRoomStore {

    /** Result of entering the pre-sale waiting room. */
    enum WaitingRoomEntry {
        /** The buyer is in the waiting room, or already holds a shopping session. */
        ENTERED,
        /** The opening draw has started, so the buyer must join the drawn queue instead. */
        DRAW_STARTED
    }

    /** Result of turning the waiting room into the randomized sale queue. */
    enum DrawResult {
        READY,
        /** Another worker holds the draw, or the draw could not start. */
        PREPARING,
        /** The draw lost its lease before it finished. */
        INCOMPLETE
    }

    /** Result of offering the head of the queue a shopping session. */
    enum AdmissionGrant {
        GRANTED,
        /** The candidate's presence expired; they were removed and the next candidate may proceed. */
        SKIPPED_EXPIRED,
        /** No budget or capacity is left, or the candidate is no longer at the head. */
        STOPPED
    }

    record AdmissionBudget(
            Duration sessionTtl,
            int capacity,
            int globalCapacity,
            int rate,
            int burst,
            int globalRate,
            int globalBurst,
            boolean adaptive) {}

    /**
     * A buyer's position as stored. The waiting-room, queue and active counts are present only
     * when the store tracked presence for the request.
     */
    record StoredStatus(
            QueueStatus status,
            Integer position,
            Integer peopleAhead,
            Long estimatedWaitSeconds,
            String sessionToken,
            OffsetDateTime sessionExpiresAt,
            Long waitingRoomSize,
            Long queueSize,
            Long activeShoppers) {}

    void registerConcert(UUID concertId);

    Set<String> dueConcerts(long nowMillis, int limit);

    void unregisterConcert(String concert);

    /** Checks the concert again in about a second. */
    void postponeConcert(String concert);

    boolean acquireSchedulerLease(String lease, Duration ttl);

    void releaseSchedulerLease(String lease);

    String schedulerCursor();

    void moveSchedulerCursor(String concert, Duration ttl);

    /**
     * Returns the seed that orders opening priorities, or an empty string when none applies.
     * With {@code create}, the first caller before the draw stores a new seed.
     */
    String openingSeed(UUID concertId, boolean create, long seedTtlMillis);

    WaitingRoomEntry enterWaitingRoom(
            UUID concertId, UUID userId, long presenceTtlMillis, String priority);

    void joinQueue(UUID concertId, UUID userId, long presenceTtlMillis);

    boolean queueReady(UUID concertId);

    DrawResult drawQueue(UUID concertId);

    Optional<StoredStatus> status(
            UUID concertId,
            UUID userId,
            long nowMillis,
            long presenceTtlMillis,
            int capacity,
            long estimatedServiceSeconds);

    boolean hasLeft(UUID concertId, UUID userId);

    /** Rank in the waiting room or in the entrants awaiting the draw, if the buyer is in either. */
    Optional<Long> waitingRoomRank(UUID concertId, UUID userId);

    /** Removes the buyer everywhere and returns the shopping-session token they held, if any. */
    String leave(UUID concertId, UUID userId);

    List<UUID> queueHead(UUID concertId, int limit);

    AdmissionGrant admit(UUID concertId, UUID userId, String sessionToken, AdmissionBudget budget);

    String sessionToken(UUID concertId, UUID userId);

    /** Ends the session; with a non-empty {@code expectedToken}, only when it still matches. */
    void finishShoppingSession(UUID concertId, UUID userId, String expectedToken);

    void touchPresence(UUID concertId, UUID userId, long deadlineMillis);

    void removePresence(UUID concertId, UUID userId);

    /** Up to 64 buyers whose presence deadline has passed, by the Redis clock or {@code nowMillis}. */
    Collection<?> expiredPresence(UUID concertId, boolean useStoreClock, long nowMillis);

    /** Removes a buyer whose presence expired, unless they renewed it or hold a session. */
    boolean removeExpired(UUID concertId, UUID userId, long nowMillis, boolean useStoreClock);

    long waitingRoomSize(UUID concertId);

    long queueSize(UUID concertId);

    long activeShoppers(UUID concertId, long nowMillis);
}
