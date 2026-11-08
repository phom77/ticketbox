package org.ticketbox.identity.account.application.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateUserStatusRequest(
        @NotNull(message = "{validation.account.status-required}") Boolean isActive) {}
