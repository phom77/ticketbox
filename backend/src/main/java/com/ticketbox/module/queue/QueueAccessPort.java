package com.ticketbox.module.queue;

import java.util.UUID;

public interface QueueAccessPort {
    void validateAccess(UUID concertId, UUID userId, String queueAccessToken);

    /** Frees an admission slot after the user has safely created an order. */
    void finishShoppingSession(UUID concertId, UUID userId);
    default void finishShoppingSession(UUID concertId, UUID userId, String expectedToken) {
        finishShoppingSession(concertId,userId);
    }
}
