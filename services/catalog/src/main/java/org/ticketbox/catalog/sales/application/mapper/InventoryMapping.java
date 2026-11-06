package org.ticketbox.catalog.sales.application.mapper;

import org.ticketbox.catalog.sales.CatalogAvailabilityReader;
import lombok.RequiredArgsConstructor;
import org.mapstruct.Named;
import org.springframework.stereotype.Component;
import java.util.UUID;

@Component @RequiredArgsConstructor
public class InventoryMapping {
    private final CatalogAvailabilityReader inventory;
    @Named("available") public int available(UUID ticketTypeId) { return inventory.available(ticketTypeId); }
}
