package com.ticketbox.infrastructure.redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.ticketbox.module.concert.application.CachedConcertPage;
import com.ticketbox.shared.util.PublicCatalogCache;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class RedisReadCacheIntegrationTest {
    @Container static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Test
    void concretePageSurvivesRedisRoundTripAndConcurrentColdRequestsLoadOnce() throws Exception {
        var factory = new LettuceConnectionFactory(redis.getHost(), redis.getFirstMappedPort());
        factory.afterPropertiesSet();
        try {
            var mapper = new ObjectMapper().registerModule(new JavaTimeModule());
            var template = new RedisConfig().redisTemplate(factory, mapper);
            var cache = new RedisReadCache(template, mapper, new SimpleMeterRegistry());
            String key = "test:page:" + UUID.randomUUID();
            AtomicInteger loads = new AtomicInteger();
            try (var pool = Executors.newFixedThreadPool(10)) {
                var tasks = java.util.stream.IntStream.range(0, 20).mapToObj(i -> pool.submit(() ->
                        cache.get("catalog", key, CachedConcertPage.class, Duration.ofMinutes(1), () -> {
                            loads.incrementAndGet();
                            return new CachedConcertPage(List.of(), 41);
                        }))).toList();
                for (var task : tasks) assertThat(task.get().toPage(PageRequest.of(0, 10)).getTotalElements()).isEqualTo(41);
            }
            assertThat(loads).hasValue(1);
            assertThat(cache.get("catalog", key, CachedConcertPage.class, Duration.ofMinutes(1), () -> {
                throw new AssertionError("A warm read must not call the database loader");
            }).totalElements()).isEqualTo(41);
            PublicCatalogCache.evictAfterCommit(template, UUID.randomUUID());
            assertThat(PublicCatalogCache.listVersion(template)).isNotEqualTo("0");
        } finally { factory.destroy(); }
    }
}
