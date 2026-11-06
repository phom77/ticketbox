package org.ticketbox.ticketing.inventory.hold.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketHoldResponse(
        UUID ticketTypeId,
        int quantity,
        OffsetDateTime expiresAt
) {}
