package org.ticketbox.ticketing.order.application.port;

import java.util.UUID;

public interface PurchaseSessions {
    boolean acquire(String key, String token);

    void release(String key, String token);

    Long remainingSeconds(UUID concertId, UUID userId);
}
