package com.ticketbox.module.ticket;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderNotificationItemView(
        UUID ticketTypeId,
        String ticketTypeName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal subtotal
) {}
