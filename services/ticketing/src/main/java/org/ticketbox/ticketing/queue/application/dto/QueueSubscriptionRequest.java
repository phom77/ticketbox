package org.ticketbox.ticketing.queue.application.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record QueueSubscriptionRequest(@NotNull UUID concertId) {}
