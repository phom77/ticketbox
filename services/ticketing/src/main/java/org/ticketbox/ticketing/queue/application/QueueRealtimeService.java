package org.ticketbox.ticketing.queue.application;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomOperations;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy;
import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Pushes admission to eligible private STOMP sessions. HTTP remains the recovery path. */
@Service
@RequiredArgsConstructor
@Slf4j
public class QueueRealtimeService {

    private final WaitingRoomOperations waitingRoomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, Subscription> subscriptions = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> concertSubscriptions = new ConcurrentHashMap<>();
    private final Map<Subscription, Set<String>> audienceSubscriptions = new ConcurrentHashMap<>();

    @Value("${ticketbox.queue.adaptive-enabled:false}")
    private boolean adaptiveEnabled;

    @Value("${ticketbox.queue.websocket-snapshot-interval-ms:10000}")
    private long snapshotIntervalMs;

    private long lastSnapshotAt;

    public void subscribe(String sessionId, UUID userId, UUID concertId) {
        if (!adaptiveEnabled) {
            register(sessionId, new Subscription(userId, concertId));
            pushLegacy(sessionId, userId, concertId);
            return;
        }

        handleDisconnect(sessionId);
        QueueStatusResponse status = waitingRoomService.status(concertId, userId);
        if (status.status() == QueueStatus.ADMITTED) {
            push(sessionId, userId, concertId, status);
        } else if (nearFront(status)) {
            register(sessionId, new Subscription(userId, concertId));
            try {
                // Catch an admission that happened after the eligibility check.
                status = waitingRoomService.internalStatus(concertId, userId);
                if (!nearFront(status)) handleDisconnect(sessionId);
                if (nearFront(status) || status.status() == QueueStatus.ADMITTED) {
                    push(sessionId, userId, concertId, status);
                }
            } catch (RuntimeException failure) {
                handleDisconnect(sessionId);
                throw failure;
            }
        }
    }

    private boolean nearFront(QueueStatusResponse status) {
        return AdmissionPolicy.nearFront(status.status(), status.position());
    }

    private synchronized void register(String sessionId, Subscription subscription) {
        handleDisconnect(sessionId);
        subscriptions.put(sessionId, subscription);
        audienceSubscriptions.computeIfAbsent(subscription, ignored ->
                ConcurrentHashMap.newKeySet()).add(sessionId);
        concertSubscriptions.merge(subscription.concertId(), 1, Integer::sum);
    }

    @Scheduled(fixedDelayString = "${ticketbox.queue.websocket-push-interval-ms:1000}")
    public void publishUpdates() {
        var concerts = java.util.List.copyOf(concertSubscriptions.keySet());
        for (UUID concertId : concerts) {
            try {
                if (System.currentTimeMillis() - lastSnapshotAt >= snapshotIntervalMs) {
                    messagingTemplate.convertAndSend(
                            "/topic/queue/concerts/" + concertId,
                            waitingRoomService.snapshot(concertId));
                }
            } catch (RuntimeException exception) {
                log.debug("Queue update unavailable for {}", concertId, exception);
            }
        }
        if (System.currentTimeMillis() - lastSnapshotAt >= snapshotIntervalMs)
            lastSnapshotAt = System.currentTimeMillis();
    }

    public void onAdmissionHint(UUID concertId, UUID userId) {
        Set<String> audience = audienceSubscriptions.get(new Subscription(userId, concertId));
        if (audience == null || audience.isEmpty()) return;
        var status = waitingRoomService.internalStatus(concertId, userId);
        if (!adaptiveEnabled) {
            messagingTemplate.convertAndSendToUser(
                    userId.toString(), "/queue/concerts/" + concertId, status);
            return;
        }
        if (status.status() == QueueStatus.ADMITTED) {
            for (String sessionId : Set.copyOf(audience)) {
                push(sessionId, userId, concertId, status);
                handleDisconnect(sessionId);
            }
        }
    }

    public synchronized void handleDisconnect(String sessionId) {
        // A transport disconnect is not an explicit leave; reconnect retains membership.
        Subscription removed = subscriptions.remove(sessionId);
        if (removed == null) return;
        concertSubscriptions.computeIfPresent(
                removed.concertId(), (key, count) -> count <= 1 ? null : count - 1);
        audienceSubscriptions.computeIfPresent(removed, (key, sessions) -> {
            sessions.remove(sessionId);
            return sessions.isEmpty() ? null : sessions;
        });
    }

    private void pushLegacy(String sessionId, UUID userId, UUID concertId) {
        try {
            push(sessionId, userId, concertId, waitingRoomService.status(concertId, userId));
        } catch (RuntimeException exception) {
            log.debug("Could not push waiting-room update for session {}", sessionId, exception);
        }
    }

    private void push(String sessionId, UUID userId, UUID concertId, QueueStatusResponse status) {
        var headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId(sessionId);
        headers.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(
                userId.toString(), "/queue/concerts/" + concertId, status, headers.getMessageHeaders());
    }

    private record Subscription(UUID userId, UUID concertId) {}
}
