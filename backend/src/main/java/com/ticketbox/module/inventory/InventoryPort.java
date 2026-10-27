package com.ticketbox.module.inventory;

import java.util.UUID;

/** All operations participate in the caller's local Ticketing transaction. */
public interface InventoryPort {
    int available(UUID ticketTypeId);
    boolean reserve(UUID ticketTypeId, int quantity);
    void release(UUID ticketTypeId, int quantity);
    void resizePristine(UUID ticketTypeId, int total);
    void setActive(UUID ticketTypeId, boolean active);
}
