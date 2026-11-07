package org.ticketbox.catalog.concert.application.dto;

import jakarta.validation.constraints.NotNull;

import org.ticketbox.catalog.concert.domain.Concert;

public record UpdateStatusRequest(
        @NotNull(message = "Status must not be null") Concert.Status status) {}
