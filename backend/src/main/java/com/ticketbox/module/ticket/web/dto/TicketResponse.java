package com.ticketbox.module.ticket.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketResponse(
        UUID id,
        UUID concertId,
        String concertTitle,
        UUID ticketTypeId,
        String ticketTypeName,
        String qrCode,
        String status,
        OffsetDateTime issuedAt
) {}
