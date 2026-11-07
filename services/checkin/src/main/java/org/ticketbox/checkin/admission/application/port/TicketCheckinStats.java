package org.ticketbox.checkin.admission.application.port;

import java.time.OffsetDateTime;

public record TicketCheckinStats(
        long total,
        long valid,
        long used,
        long cancelled,
        long transferred,
        OffsetDateTime datasetUpdatedAt) {}
