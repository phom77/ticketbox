package org.ticketbox.ticketing.queue.web.dto;

import org.ticketbox.ticketing.queue.application.QueueStatus;

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
        Long activeShoppers
) {
}
