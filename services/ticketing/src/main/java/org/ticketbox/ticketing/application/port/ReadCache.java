package org.ticketbox.ticketing.application.port;

import java.time.Duration;
import java.util.function.Supplier;

public interface ReadCache {
    <T> T get(String namespace, String key, Class<T> type, Duration ttl, Supplier<T> loader);
}
