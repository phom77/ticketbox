package org.ticketbox.catalog.concert.web.dto;

import org.ticketbox.catalog.concert.domain.Concert;
import jakarta.validation.constraints.NotNull;

public record UpdateStatusRequest(
        @NotNull(message = "Status must not be null")
        Concert.Status status
) {}
