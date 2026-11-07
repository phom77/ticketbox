package org.ticketbox.ticketing.inventory.hold.application.port;

import java.util.UUID;

public interface PurchaseLock {
    void lock(UUID userId, UUID concertId);
}
