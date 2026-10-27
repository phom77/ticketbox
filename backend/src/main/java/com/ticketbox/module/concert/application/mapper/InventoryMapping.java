package com.ticketbox.module.concert.application.mapper;

import com.ticketbox.module.inventory.InventoryPort;
import lombok.RequiredArgsConstructor;
import org.mapstruct.Named;
import org.springframework.stereotype.Component;
import java.util.UUID;

@Component @RequiredArgsConstructor
public class InventoryMapping {
    private final InventoryPort inventory;
    @Named("available") public int available(UUID ticketTypeId) { return inventory.available(ticketTypeId); }
}
