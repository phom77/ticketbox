package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;

public record StaffConcertOverviewResponse(
        StaffConcertResponse concert,
        long totalTickets,
        long validTickets,
        long usedTickets,
        long cancelledTickets,
        long transferredTickets,
        long totalCheckins,
        OffsetDateTime datasetUpdatedAt
) {
}
