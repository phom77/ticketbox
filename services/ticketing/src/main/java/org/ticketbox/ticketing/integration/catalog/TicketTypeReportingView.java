package org.ticketbox.ticketing.integration.catalog;

import java.math.BigDecimal;
import java.util.UUID;

public record TicketTypeReportingView(
        UUID id,
        String name,
        BigDecimal price,
        int totalQuantity) {
}
