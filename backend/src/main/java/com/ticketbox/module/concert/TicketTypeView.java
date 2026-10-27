package com.ticketbox.module.concert;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketTypeView(
    UUID id,
    UUID concertId,
    String name,
    BigDecimal price,
    int totalQuantity,
    int availableQty,
    int maxPerAccount,
    boolean isActive
) {}
