package org.ticketbox.checkin.admission.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ScanTicketResponse (
        UUID ticketId,
        UUID concertId,
        String status,
        String message,
        OffsetDateTime checkAt
) {}
