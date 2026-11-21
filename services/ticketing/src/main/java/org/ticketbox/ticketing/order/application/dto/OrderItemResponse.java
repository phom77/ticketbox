package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderItemResponse(
        UUID id,
        UUID ticketTypeId,
        String ticketTypeName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal subtotal,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID seatId,
        @JsonInclude(JsonInclude.Include.NON_NULL) String sectionLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rowLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String seatLabel) {}
