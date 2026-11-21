package org.ticketbox.checkin.application.port;

import com.fasterxml.jackson.databind.JsonNode;

import org.ticketbox.checkin.application.port.catalog.PerformanceAdmissionSnapshot;

import java.util.UUID;

public interface ProjectionSnapshots {
    void catalog(JsonNode envelope);

    void ticket(JsonNode envelope);

    long performance(PerformanceAdmissionSnapshot snapshot);

    void performanceTicket(UUID id, JsonNode envelope);
}
