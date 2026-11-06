package com.ticketbox.shared.event;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** JSON integration contract v1; consumers do not need this Java class. */
public record RemoteNotificationRequested(int schemaVersion, String eventType, UUID eventId, UUID aggregateId,
        UUID userId, OffsetDateTime occurredAt, String correlationId, Map<String,Object> payload) {}
