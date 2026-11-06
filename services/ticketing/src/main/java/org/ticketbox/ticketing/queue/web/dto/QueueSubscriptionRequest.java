package org.ticketbox.ticketing.queue.web.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record QueueSubscriptionRequest(@NotNull UUID concertId) {
}
