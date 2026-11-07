package org.ticketbox.ticketing.inventory.hold.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketHoldResponse(UUID ticketTypeId, int quantity, OffsetDateTime expiresAt) {}
