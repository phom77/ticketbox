package org.ticketbox.ticketing.queue.application;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.queue.application.dto.QueueSnapshotResponse;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;
import org.ticketbox.ticketing.queue.application.port.AdaptiveAdmissionPolicy;
import org.ticketbox.ticketing.queue.application.port.QueueAccessPort;
import org.ticketbox.ticketing.queue.application.port.QueueRequestLimiter;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomOperations;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore.AdmissionBudget;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore.AdmissionGrant;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore.StoredStatus;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore.WaitingRoomEntry;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy;
import org.ticketbox.ticketing.queue.domain.QueueStatus;
import org.ticketbox.ticketing.queue.domain.ShoppingSession;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Waiting-room and queue use cases: entering before the sale, the opening draw, queue positions,
 * admission into shopping sessions and leaving. {@link WaitingRoomStore} keeps the shared state
 * atomic across workers.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WaitingRoomService implements QueueAccessPort, WaitingRoomOperations {

    private static final int ADMISSION_BATCH = 8;

    private final WaitingRoomStore store;
    private final QueueMetadataService metadata;
    private final QueueRequestLimiter requestLimiter;
    private final ApplicationEventPublisher eventPublisher;
    private final AdaptiveAdmissionPolicy admissionPolicy;

    @Value("${ticketbox.queue.adaptive-enabled:false}")
    private boolean adaptiveEnabled;

    @Value("${ticketbox.queue.admission-capacity:1}")
    private int admissionCapacity = 8;

    @Value("${ticketbox.queue.global-admission-capacity:32}")
    private int globalAdmissionCapacity = 32;

    @Value("${ticketbox.queue.admission-rate:2}")
    private int admissionRate = 2;

    @Value("${ticketbox.queue.admission-burst:2}")
    private int admissionBurst = 2;

    @Value("${ticketbox.queue.global-admission-rate:8}")
    private int globalAdmissionRate = 8;

    @Value("${ticketbox.queue.global-admission-burst:8}")
    private int globalAdmissionBurst = 8;

    @Value("${ticketbox.queue.shopping-session-ttl:PT10M}")
    private Duration sessionTtl = Duration.ofMinutes(10);

    @Value("${ticketbox.queue.estimated-service-seconds:45}")
    private long estimatedServiceSeconds = 45;

    @Value("${ticketbox.queue.waiting-room-open-before:PT1H}")
    private Duration waitingRoomOpenBefore = Duration.ofHours(1);

    @Value("${ticketbox.queue.waiting-presence-ttl:PT1M}")
    private Duration presenceTtl = Duration.ofMinutes(1);

    @Value("${ticketbox.queue.adaptive-presence-ttl:PT3M}")
    private Duration adaptivePresenceTtl = Duration.ofMinutes(3);

    @jakarta.annotation.PostConstruct
    void validateBudgets() {
        if (admissionCapacity < 1
                || globalAdmissionCapacity < 1
                || admissionRate < 1
                || admissionBurst < 1
                || globalAdmissionRate < 1
                || globalAdmissionBurst < 1
                || sessionTtl.isNegative()
                || sessionTtl.isZero()
                || (adaptiveEnabled && adaptivePresenceTtl.toMillis() <= 0)) {
            throw new IllegalArgumentException("Queue budgets and session TTL must be positive");
        }
    }

    @Override
    public QueueStatusResponse join(UUID concertId, UUID userId) {
        consumeRateLimit(userId, QueueRequestLimiter.Action.JOIN);
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        store.registerConcert(concertId);

        if (isBeforeSaleStart(concert)) {
            String priority = openingPriority(concert, userId);
            WaitingRoomEntry entry =
                    store.enterWaitingRoom(concertId, userId, adaptivePresenceMillis(), priority);
            if (entry != WaitingRoomEntry.DRAW_STARTED) {
                if (adaptiveEnabled) return readStatus(concertId, userId);
                touchPresence(concertId, userId);
                return waitingRoomStatus(concertId, userId);
            }
        }

        ensureQueueDrawn(concertId);

        store.joinQueue(concertId, userId, adaptivePresenceMillis());
        QueueStatusResponse response = readStatus(concertId, userId);
        if (!adaptiveEnabled) updatePresence(concertId, userId, response.status());
        return response;
    }

    @Override
    public QueueStatusResponse status(UUID concertId, UUID userId) {
        consumeRateLimit(userId, QueueRequestLimiter.Action.STATUS);
        return internalStatus(concertId, userId);
    }

    @Override
    public QueueStatusResponse internalStatus(UUID concertId, UUID userId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (adaptiveEnabled) return readStatus(concertId, userId);
        if (isBeforeSaleStart(concert)) {
            QueueStatusResponse response = waitingRoomStatus(concertId, userId);
            updatePresence(concertId, userId, response.status());
            return response;
        }
        if (!store.queueReady(concertId)) {
            QueueStatusResponse response = waitingRoomStatus(concertId, userId);
            updatePresence(concertId, userId, response.status());
            return response;
        }
        QueueStatusResponse response = readStatus(concertId, userId);
        updatePresence(concertId, userId, response.status());
        return response;
    }

    @Override
    @Transactional
    public QueueStatusResponse leave(UUID concertId, UUID userId) {
        String departedToken = store.leave(concertId, userId);
        eventPublisher.publishEvent(
                new com.ticketbox.shared.event.UserLeftQueueEvent(
                        concertId, userId, departedToken));
        return new QueueStatusResponse(QueueStatus.LEFT, null, null, null, null, null, 0L, 0L, 0L);
    }

    /**
     * Creates the randomized queue at sale time even if no browser happens to request a status
     * then.
     */
    @Override
    @Scheduled(fixedDelayString = "${ticketbox.queue.snapshot-check-interval-ms:1000}")
    public void createDueQueueSnapshots() {
        if (!adaptiveEnabled) {
            processDueConcerts();
            return;
        }
        String lease = UUID.randomUUID().toString();
        if (!store.acquireSchedulerLease(lease, Duration.ofSeconds(10))) return;
        try {
            processDueConcerts();
        } finally {
            store.releaseSchedulerLease(lease);
        }
    }

    private void processDueConcerts() {
        Set<String> due = store.dueConcerts(Instant.now().toEpochMilli(), 128);
        if (due.isEmpty()) return;
        List<String> ready = new ArrayList<>();
        long window = adaptiveEnabled ? admissionPolicy.completedWindow() : 0;
        for (String member : due) {
            try {
                UUID concertId = UUID.fromString(member);
                ConcertView concert = metadata.get(concertId);
                cleanupDisconnectedUsers(concertId);
                if (!"ON_SALE".equals(concert.status())
                        || (concert.saleEndAt() != null && concert.saleEndAt().isBefore(OffsetDateTime.now()))) {
                    store.unregisterConcert(member);
                } else if (!isBeforeSaleStart(concert)) {
                    if (adaptiveEnabled) {
                        ensureQueueDrawn(concertId);
                        admissionPolicy.refreshConcert(concertId, window);
                        if (store.queueSize(concertId) > 0) ready.add(member);
                    } else {
                        publishAdmissions(concertId, promoteWaitingUsers(concertId));
                    }
                }
            } catch (RuntimeException exception) {
                log.warn("Could not prepare queue for {}", member, exception);
            } finally {
                store.postponeConcert(member);
            }
        }
        if (!ready.isEmpty()) {
            admissionPolicy.refreshShared(window);
            serveReadyConcerts(ready);
        }
    }

    private void serveReadyConcerts(List<String> ready) {
        // Rotate the first turn even when only one shared grant is available.
        Collections.sort(ready);
        String previous = store.schedulerCursor();
        if (previous != null) {
            int index = Collections.binarySearch(ready, previous);
            int next = index >= 0 ? index + 1 : -index - 1;
            Collections.rotate(ready, -next);
        }
        store.moveSchedulerCursor(ready.getFirst(), Duration.ofMinutes(5));

        // Concerts that still have budget get another turn without waiting for the next tick.
        for (int round = 0; round < 8 && !ready.isEmpty(); round++) {
            List<String> nextTurn = new ArrayList<>();
            for (String member : ready) {
                UUID concertId = UUID.fromString(member);
                try {
                    var grants = grantBatch(concertId, ADMISSION_BATCH);
                    publishAdmissions(concertId, grants);
                    if (grants.size() == ADMISSION_BATCH) nextTurn.add(member);
                } catch (RuntimeException exception) {
                    log.warn("Could not admit queued users for {}", member, exception);
                }
            }
            ready = nextTurn;
        }
    }

    private void publishAdmissions(UUID concertId, Map<UUID, QueueStatusResponse> admitted) {
        admitted.forEach((userId, status) ->
                eventPublisher.publishEvent(new QueueAdmissionEvent(concertId, userId, status)));
    }

    @Override
    public QueueSnapshotResponse snapshot(UUID concertId) {
        return new QueueSnapshotResponse(
                concertId,
                store.waitingRoomSize(concertId),
                store.queueSize(concertId),
                activeShoppers(concertId),
                OffsetDateTime.now());
    }

    /** Checks only the bounded head of the queue, never every connected session. */
    @Override
    public Map<UUID, QueueStatusResponse> promoteWaitingUsers(UUID concertId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (isBeforeSaleStart(concert)) return Map.of();
        ensureQueueDrawn(concertId);
        if (adaptiveEnabled) {
            long window = admissionPolicy.completedWindow();
            admissionPolicy.refreshShared(window);
            admissionPolicy.refreshConcert(concertId, window);
        }
        return grantBatch(concertId, adaptiveEnabled ? ADMISSION_BATCH
                : Math.min(Math.max(1, admissionCapacity), 64));
    }

    private Map<UUID, QueueStatusResponse> grantBatch(UUID concertId, int limit) {
        AdmissionBudget budget = new AdmissionBudget(
                sessionTtl, admissionCapacity, globalAdmissionCapacity, admissionRate, admissionBurst,
                globalAdmissionRate, globalAdmissionBurst, adaptiveEnabled);
        Map<UUID, QueueStatusResponse> admitted = new LinkedHashMap<>();
        for (UUID userId : store.queueHead(concertId, limit)) {
            AdmissionGrant grant = store.admit(concertId, userId, UUID.randomUUID().toString(), budget);
            if (grant == AdmissionGrant.GRANTED) {
                admitted.put(userId, readStatus(concertId, userId));
            } else if (grant != AdmissionGrant.SKIPPED_EXPIRED) break;
        }
        return admitted;
    }

    @Override
    public void validateAccess(UUID concertId, UUID userId, String queueAccessToken) {
        ShoppingSession.requireToken(queueAccessToken);
        String storedToken = store.sessionToken(concertId, userId);
        new ShoppingSession(concertId, userId, storedToken).authorize(queueAccessToken);
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId) {
        finishShoppingSession(concertId, userId, "");
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId, String expectedToken) {
        store.finishShoppingSession(concertId, userId, expectedToken);
    }

    private QueueStatusResponse readStatus(UUID concertId, UUID userId) {
        StoredStatus stored = store.status(
                        concertId,
                        userId,
                        Instant.now().toEpochMilli(),
                        adaptivePresenceMillis(),
                        Math.max(1, admissionCapacity),
                        Math.max(1, estimatedServiceSeconds))
                .orElseThrow(() -> new AppException(
                        ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.unavailable"));

        QueueStatus status = stored.status();
        Integer position = stored.position();
        return new QueueStatusResponse(
                status,
                position,
                stored.peopleAhead(),
                stored.estimatedWaitSeconds(),
                stored.sessionToken(),
                stored.sessionExpiresAt(),
                adaptiveEnabled ? stored.waitingRoomSize() : 0L,
                adaptiveEnabled ? stored.queueSize() : store.queueSize(concertId),
                adaptiveEnabled ? stored.activeShoppers() : activeShoppers(concertId),
                adaptiveEnabled ? AdmissionPolicy.pollAfterMs(status, position) : null);
    }

    @Override
    public boolean isStillWaiting(UUID concertId, UUID userId) {
        QueueStatus status = internalStatus(concertId, userId).status();
        return status == QueueStatus.WAITING_ROOM || status == QueueStatus.WAITING;
    }

    private QueueStatusResponse waitingRoomStatus(UUID concertId, UUID userId) {
        if (store.hasLeft(concertId, userId)) {
            return new QueueStatusResponse(
                    QueueStatus.LEFT, null, null, null, null, null, 0L, 0L, 0L);
        }
        if (store.waitingRoomRank(concertId, userId).isEmpty()) {
            return new QueueStatusResponse(
                    QueueStatus.EXPIRED, null, null, null, null, null, 0L, 0L, 0L);
        }
        return new QueueStatusResponse(
                QueueStatus.WAITING_ROOM,
                null,
                null,
                null,
                null,
                null,
                store.waitingRoomSize(concertId),
                0L,
                0L);
    }

    private ConcertView validateConcertForWaitingRoom(UUID concertId) {
        ConcertView concert = metadata.get(concertId);
        if (!"ON_SALE".equals(concert.status())) {
            throw new AppException(ErrorCode.CONCERT_NOT_ON_SALE, "error.concert-not-on-sale");
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (concert.saleStartAt() == null
                || concert.saleStartAt().minus(waitingRoomOpenBefore).isAfter(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "error.waiting-room.not-open");
        }
        if (concert.saleEndAt() != null && concert.saleEndAt().isBefore(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "error.waiting-room.sale-ended");
        }
        return concert;
    }

    private boolean isBeforeSaleStart(ConcertView concert) {
        return concert.saleStartAt().isAfter(OffsetDateTime.now());
    }

    private String openingPriority(ConcertView concert, UUID userId) {
        UUID concertId = concert.id();
        long seedTtl = Math.max(1, Duration.between(Instant.now(), concert.saleStartAt().toInstant())
                .plusDays(1).toMillis());
        String seed = store.openingSeed(concertId, adaptiveEnabled, seedTtl);
        if (seed.isEmpty()) return "";
        try {
            Mac random = Mac.getInstance("HmacSHA256");
            random.init(new SecretKeySpec(seed.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Long.toString(ByteBuffer.wrap(random.doFinal(
                    userId.toString().getBytes(StandardCharsets.UTF_8))).getLong() >>> 12);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Cannot assign an opening priority", exception);
        }
    }

    private void ensureQueueDrawn(UUID concertId) {
        switch (store.drawQueue(concertId)) {
            case READY -> { }
            case PREPARING -> throw new AppException(
                    ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.preparing");
            case INCOMPLETE -> throw new AppException(
                    ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.cannot-complete");
        }
    }

    private void touchPresence(UUID concertId, UUID userId) {
        store.touchPresence(concertId, userId, Instant.now().plus(presenceTtl).toEpochMilli());
    }

    private long adaptivePresenceMillis() {
        return adaptiveEnabled ? adaptivePresenceTtl.toMillis() : 0;
    }

    private void updatePresence(UUID concertId, UUID userId, QueueStatus status) {
        if (status == QueueStatus.WAITING || status == QueueStatus.WAITING_ROOM)
            touchPresence(concertId, userId);
        else store.removePresence(concertId, userId);
    }

    private void cleanupDisconnectedUsers(UUID concertId) {
        for (Object candidate :
                store.expiredPresence(concertId, adaptiveEnabled, Instant.now().toEpochMilli())) {
            UUID userId = UUID.fromString(candidate.toString());
            if (removeExpiredUser(concertId, userId)) {
                eventPublisher.publishEvent(new com.ticketbox.shared.event.UserLeftQueueEvent(concertId, userId));
            }
        }
    }

    private boolean removeExpiredUser(UUID concertId, UUID userId) {
        // The store rechecks live membership, deadline, and session after reading candidates.
        return store.removeExpired(concertId, userId, Instant.now().toEpochMilli(), adaptiveEnabled);
    }

    private void consumeRateLimit(UUID userId, QueueRequestLimiter.Action action) {
        if (!requestLimiter.tryAcquire(userId, action)) {
            throw new AppException(
                    ErrorCode.RATE_LIMIT_EXCEEDED, "error.waiting-room.rate-limited");
        }
    }

    private long activeShoppers(UUID concertId) {
        return store.activeShoppers(concertId, Instant.now().toEpochMilli());
    }
}
