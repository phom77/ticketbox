package com.ticketbox.infrastructure.redis;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.function.Supplier;
import java.util.stream.IntStream;

/** Bounded local single-flight; the shared proxy collapses refreshes across API nodes. */
@Component
public class RedisReadCache {
    private final RedisTemplate<String, Object> redis;
    private final ObjectMapper mapper;
    private final MeterRegistry metrics;
    private final Object[] locks = IntStream.range(0, 128).mapToObj(i -> new Object()).toArray();

    public RedisReadCache(RedisTemplate<String, Object> redis, ObjectMapper mapper, MeterRegistry metrics) {
        this.redis = redis;
        this.mapper = mapper;
        this.metrics = metrics;
    }

    public <T> T get(String namespace, String key, Class<T> type, Duration ttl, Supplier<T> loader) {
        return get(namespace, key, mapper.constructType(type), ttl, loader);
    }

    public <T> T get(String namespace, String key, TypeReference<T> type, Duration ttl, Supplier<T> loader) {
        return get(namespace, key, mapper.constructType(type), ttl, loader);
    }

    private <T> T get(String namespace, String key, JavaType type, Duration ttl, Supplier<T> loader) {
        T cached = read(namespace, key, type);
        if (cached != null) return cached;
        synchronized (locks[Math.floorMod(key.hashCode(), locks.length)]) {
            cached = read(namespace, key, type);
            if (cached != null) return cached;
            metrics.counter("ticketbox.cache.requests", "cache", namespace, "result", "miss").increment();
            T result = loader.get();
            try {
                redis.opsForValue().set(key, result, ttl);
            } catch (RuntimeException exception) {
                metrics.counter("ticketbox.cache.errors", "cache", namespace, "operation", "write").increment();
            }
            return result;
        }
    }

    private <T> T read(String namespace, String key, JavaType type) {
        try {
            Object value = redis.opsForValue().get(key);
            if (value == null) return null;
            T result = mapper.convertValue(value, type);
            metrics.counter("ticketbox.cache.requests", "cache", namespace, "result", "hit").increment();
            return result;
        } catch (RuntimeException exception) {
            metrics.counter("ticketbox.cache.errors", "cache", namespace, "operation", "read").increment();
            return null;
        }
    }
}
