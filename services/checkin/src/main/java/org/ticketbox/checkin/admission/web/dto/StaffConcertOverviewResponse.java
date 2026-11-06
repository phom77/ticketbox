package org.ticketbox.checkin.admission.web.dto;

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
