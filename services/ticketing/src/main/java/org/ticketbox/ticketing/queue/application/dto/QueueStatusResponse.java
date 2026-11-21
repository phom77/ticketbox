package org.ticketbox.ticketing.queue.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.time.OffsetDateTime;

public record QueueStatusResponse(
        QueueStatus status,
        Integer position,
        Integer peopleAhead,
        Long estimatedWaitSeconds,
        String queueAccessToken,
        OffsetDateTime sessionExpiresAt,
        Long waitingRoomCount,
        Long queueSize,
        Long activeShoppers,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long pollAfterMs) {

    public QueueStatusResponse(QueueStatus status, Integer position, Integer peopleAhead,
            Long estimatedWaitSeconds, String queueAccessToken, OffsetDateTime sessionExpiresAt,
            Long waitingRoomCount, Long queueSize, Long activeShoppers) {
        this(status, position, peopleAhead, estimatedWaitSeconds, queueAccessToken, sessionExpiresAt,
                waitingRoomCount, queueSize, activeShoppers, null);
    }
}
