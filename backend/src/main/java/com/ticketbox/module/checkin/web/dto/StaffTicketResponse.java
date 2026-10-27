package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record StaffTicketResponse(
        UUID ticketId,
        UUID ticketTypeId,
        UUID userId,
        String qrCode,
        String status,
        OffsetDateTime issuedAt,
        OffsetDateTime usedAt
) {
}
