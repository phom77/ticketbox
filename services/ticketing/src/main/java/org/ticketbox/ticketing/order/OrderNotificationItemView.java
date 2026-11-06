package org.ticketbox.ticketing.order;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderNotificationItemView(
        UUID ticketTypeId,
        String ticketTypeName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal subtotal
) {}
