package org.ticketbox.checkin.application.port;

public interface ProjectionSnapshots {
    void catalog(com.fasterxml.jackson.databind.JsonNode envelope);

    void ticket(com.fasterxml.jackson.databind.JsonNode envelope);
}
