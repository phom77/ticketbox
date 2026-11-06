package org.ticketbox.ticketing.queue.application;

import org.ticketbox.ticketing.queue.web.dto.QueueStatusResponse;
import java.util.UUID;

public record QueueAdmissionEvent(UUID concertId, UUID userId, QueueStatusResponse status) {}
