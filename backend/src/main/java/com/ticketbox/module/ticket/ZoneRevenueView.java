package com.ticketbox.module.ticket;

import java.math.BigDecimal;
import java.util.UUID;

public record ZoneRevenueView(
    UUID ticketTypeId,
    long soldQuantity,
    BigDecimal revenue
) {}
