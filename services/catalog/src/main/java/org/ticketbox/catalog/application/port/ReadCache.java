package org.ticketbox.catalog.application.port;

import java.time.Duration;
import java.util.function.Supplier;

public interface ReadCache {
    <T> T get(String namespace, String key, Class<T> type, Duration ttl, Supplier<T> loader);

    <T> java.util.List<T> getList(
            String namespace,
            String key,
            Class<T> itemType,
            Duration ttl,
            Supplier<java.util.List<T>> loader);

    String listVersion();

    void evictAfterCommit(java.util.UUID concertId);
}
