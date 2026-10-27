package com.ticketbox.module.concert.web.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateTicketTypeStatusRequest(
        @NotNull(message = "isActive flag must not be null")
        Boolean isActive
) {}
