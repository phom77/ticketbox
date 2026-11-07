package org.ticketbox.ticketing.order.application.port;

import java.util.UUID;

public interface OrderIdempotency {
    IdempotencyClaim claimOrder(UUID userId, String rawKey);

    void completeAfterCommit(IdempotencyClaim claim, UUID orderId);

    void release(IdempotencyClaim claim);

    public record IdempotencyClaim(String redisKey, String token, String clientKey) {}
}
