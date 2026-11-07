package org.ticketbox.catalog.sales.application.port;

import java.util.UUID;

public interface CatalogAvailabilityReader {
    int available(UUID ticketTypeId);
}
