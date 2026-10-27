package com.ticketbox.module.queue.web.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record QueueSubscriptionRequest(@NotNull UUID concertId) {
}
