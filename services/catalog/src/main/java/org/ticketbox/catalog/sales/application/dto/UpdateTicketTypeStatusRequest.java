package org.ticketbox.catalog.sales.application.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateTicketTypeStatusRequest(
        @NotNull(message = "isActive flag must not be null") Boolean isActive) {}
