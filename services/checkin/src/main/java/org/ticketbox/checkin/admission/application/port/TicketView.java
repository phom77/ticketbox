package org.ticketbox.checkin.admission.application.port;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketView(
        UUID id,
        UUID concertId,
        UUID ticketTypeId,
        UUID userId,
        String qrCode,
        String qrSecret,
        String status,
        OffsetDateTime issuedAt,
        OffsetDateTime usedAt) {}
