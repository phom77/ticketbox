package org.ticketbox.catalog.sales;

import java.util.UUID;

public interface CatalogAvailabilityReader {
    int available(UUID ticketTypeId);
}
