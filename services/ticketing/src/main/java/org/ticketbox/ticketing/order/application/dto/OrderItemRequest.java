package org.ticketbox.ticketing.order.application.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record OrderItemRequest(
        @NotNull(message = "{validation.ticket-type.required}") UUID ticketTypeId,
        @Min(value = 1, message = "{validation.quantity.min}") int quantity) {}
