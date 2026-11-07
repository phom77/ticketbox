package org.ticketbox.ticketing.queue.application.port;

import org.ticketbox.ticketing.queue.application.dto.QueueSnapshotResponse;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;

import java.util.Map;
import java.util.UUID;

public interface WaitingRoomOperations {
    QueueStatusResponse join(UUID concertId, UUID userId);

    QueueStatusResponse status(UUID concertId, UUID userId);

    QueueStatusResponse internalStatus(UUID concertId, UUID userId);

    QueueStatusResponse leave(UUID concertId, UUID userId);

    void createDueQueueSnapshots();

    QueueSnapshotResponse snapshot(UUID concertId);

    Map<UUID, QueueStatusResponse> promoteWaitingUsers(UUID concertId);

    void validateAccess(UUID concertId, UUID userId, String queueAccessToken);

    void finishShoppingSession(UUID concertId, UUID userId);

    void finishShoppingSession(UUID concertId, UUID userId, String expectedToken);

    boolean isStillWaiting(UUID concertId, UUID userId);
}
