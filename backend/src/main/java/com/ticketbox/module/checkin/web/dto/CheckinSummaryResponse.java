package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CheckinSummaryResponse(
        UUID concertId,
        long totalTickets,
        long validTickets,
        long usedTickets,
        long cancelledTickets,
        long transferredTickets,
        long checkedIn,
        long onlineCheckins,
        long offlineCheckins,
        OffsetDateTime latestCheckedAt,
        OffsetDateTime datasetUpdatedAt
) {
}
