package org.ticketbox.ticketing.reporting.application.port;

import java.math.BigDecimal;
import java.util.UUID;

public record ZoneRevenueView(UUID ticketTypeId, long soldQuantity, BigDecimal revenue) {}
