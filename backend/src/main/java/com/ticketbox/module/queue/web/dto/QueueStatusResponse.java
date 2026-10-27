package com.ticketbox.module.queue.web.dto;

import com.ticketbox.module.queue.application.QueueStatus;

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
