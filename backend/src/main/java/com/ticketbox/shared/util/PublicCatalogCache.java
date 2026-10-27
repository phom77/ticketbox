package com.ticketbox.shared.util;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

public final class PublicCatalogCache {
    public static final String LIST_VERSION = "cache:concert:list-version";
    private PublicCatalogCache() {}

    public static String listVersion(RedisTemplate<String, Object> redis) {
        try {
            Object version = redis.opsForValue().get(LIST_VERSION);
            return version == null ? "0" : version.toString();
        } catch (RuntimeException exception) {
            return "0";
        }
    }

    public static void evictAfterCommit(RedisTemplate<String, Object> redis, UUID concertId) {
        Runnable evict = () -> {
            try {
                redis.delete(List.of(RedisKeyConstants.CACHE_CONCERT_DETAIL + concertId,
                        RedisKeyConstants.CACHE_AVAILABILITY + concertId,
                        "cache:seat-map:" + concertId, "cache:ticket-types:" + concertId,
                        "cache:queue:metadata:" + concertId));
                redis.opsForValue().increment(LIST_VERSION);
            } catch (RuntimeException ignored) {
                // Short TTL bounds staleness if the cache is unavailable after DB commit.
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { evict.run(); }
            });
        } else {
            evict.run();
        }
    }
}
