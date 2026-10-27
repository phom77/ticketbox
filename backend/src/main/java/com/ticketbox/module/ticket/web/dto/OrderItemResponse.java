package com.ticketbox.module.ticket.web.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderItemResponse(
    UUID id,
    UUID ticketTypeId,
    String ticketTypeName,
    int quantity,
    BigDecimal unitPrice,
    BigDecimal subtotal
) {}
