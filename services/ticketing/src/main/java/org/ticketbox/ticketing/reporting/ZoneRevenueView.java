package org.ticketbox.ticketing.reporting;

import java.math.BigDecimal;
import java.util.UUID;

public record ZoneRevenueView(
    UUID ticketTypeId,
    long soldQuantity,
    BigDecimal revenue
) {}
