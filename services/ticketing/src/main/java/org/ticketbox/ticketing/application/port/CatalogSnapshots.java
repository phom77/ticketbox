package org.ticketbox.ticketing.application.port;

public interface CatalogSnapshots {
    void catalog(com.fasterxml.jackson.databind.JsonNode envelope);
}
