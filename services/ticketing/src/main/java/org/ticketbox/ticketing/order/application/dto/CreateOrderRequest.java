package org.ticketbox.ticketing.order.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public record CreateOrderRequest(
        @NotNull(message = "{validation.concert.required}") UUID concertId,
        @NotEmpty(message = "{validation.order.ticket-types-required}") @Valid
                List<OrderItemRequest> items) {}
