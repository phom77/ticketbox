package com.ticketbox.module.queue.application;

import com.ticketbox.module.queue.web.dto.QueueStatusResponse;
import java.util.UUID;

public record QueueAdmissionEvent(UUID concertId, UUID userId, QueueStatusResponse status) {}
