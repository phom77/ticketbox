package org.ticketbox.checkin.admission.application.dto;

import org.ticketbox.checkin.admission.application.port.GateAdmissions;

import java.time.OffsetDateTime;
import java.util.List;
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
        OffsetDateTime datasetUpdatedAt,
        List<GateAdmissions> gates,
        long guestsTotal,
        long guestsCheckedIn) {}
