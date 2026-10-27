package com.ticketbox.module.queue.application;

import com.ticketbox.module.queue.web.dto.QueueStatusResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.beans.factory.annotation.Value;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Pushes private queue state over STOMP; no browser polling is used once connected. */
@Service
@RequiredArgsConstructor
@Slf4j
public class QueueRealtimeService {

    private final WaitingRoomService waitingRoomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, Subscription> subscriptions = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> concertSubscriptions = new ConcurrentHashMap<>();
    private final Map<Subscription,Integer> audienceSubscriptions = new ConcurrentHashMap<>();
    @Value("${ticketbox.queue.websocket-snapshot-interval-ms:10000}")
    private long snapshotIntervalMs;
    private long lastSnapshotAt;

    public void subscribe(String sessionId, UUID userId, UUID concertId) {
        Subscription previous = subscriptions.put(sessionId, new Subscription(userId, concertId));
        if (previous != null) { removeConcert(previous.concertId()); removeAudience(previous); }
        audienceSubscriptions.merge(new Subscription(userId,concertId),1,Integer::sum);
        concertSubscriptions.merge(concertId, 1, Integer::sum);
        push(sessionId, userId, concertId);
    }

    @Scheduled(fixedDelayString = "${ticketbox.queue.websocket-push-interval-ms:1000}")
    public void publishUpdates() {
        var concerts = java.util.List.copyOf(concertSubscriptions.keySet());
        for (UUID concertId : concerts) {
            try {
                if (System.currentTimeMillis() - lastSnapshotAt >= snapshotIntervalMs) {
                    messagingTemplate.convertAndSend("/topic/queue/concerts/" + concertId,
                            waitingRoomService.snapshot(concertId));
                }
            } catch (RuntimeException exception) {
                log.debug("Queue update unavailable for {}", concertId, exception);
            }
        }
        if (System.currentTimeMillis() - lastSnapshotAt >= snapshotIntervalMs) lastSnapshotAt = System.currentTimeMillis();
    }

    public void onAdmissionHint(UUID concertId, UUID userId) {
        if (!audienceSubscriptions.containsKey(new Subscription(userId,concertId))) return;
        var status=waitingRoomService.internalStatus(concertId,userId);
        messagingTemplate.convertAndSendToUser(userId.toString(),"/queue/concerts/"+concertId,status);
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        // A transport disconnect is not an explicit leave; reconnect retains membership.
        Subscription removed = subscriptions.remove(event.getSessionId());
        if (removed != null) { removeConcert(removed.concertId()); removeAudience(removed); }
    }

    private void removeAudience(Subscription subscription) {
        audienceSubscriptions.computeIfPresent(subscription,(key,count) -> count <= 1 ? null : count-1);
    }

    private void removeConcert(UUID concertId) {
        concertSubscriptions.computeIfPresent(concertId, (key, count) -> count <= 1 ? null : count - 1);
    }

    private void push(String sessionId, UUID userId, UUID concertId) {
        try {
            // This initial push follows a client SUBSCRIBE request and must be rate limited.
            QueueStatusResponse status = waitingRoomService.status(concertId, userId);
            messagingTemplate.convertAndSendToUser(
                    userId.toString(),
                    "/queue/concerts/" + concertId,
                    status,
                    Map.of("simpSessionId", sessionId)
            );
        } catch (RuntimeException exception) {
            log.debug("Could not push waiting-room update for session {}", sessionId, exception);
        }
    }

    private record Subscription(UUID userId, UUID concertId) {
    }
}
