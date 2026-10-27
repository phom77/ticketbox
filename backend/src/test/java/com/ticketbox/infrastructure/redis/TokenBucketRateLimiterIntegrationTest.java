package com.ticketbox.infrastructure.redis;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;

@Testcontainers
class TokenBucketRateLimiterIntegrationTest {

    @Container
    private static final GenericContainer<?> redis = new GenericContainer<>("redis:7")
            .withExposedPorts(6379);

    private StringRedisTemplate redisTemplate;
    private LettuceConnectionFactory connectionFactory;

    private TokenBucketRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        connectionFactory = new LettuceConnectionFactory(redis.getHost(), redis.getFirstMappedPort());
        connectionFactory.afterPropertiesSet();
        redisTemplate = new StringRedisTemplate(connectionFactory);
        rateLimiter = new TokenBucketRateLimiter(redisTemplate);
        try (var connection = connectionFactory.getConnection()) { connection.serverCommands().flushDb(); }
    }

    @AfterEach
    void tearDown() {
        try (var connection = connectionFactory.getConnection()) { connection.serverCommands().flushDb(); }
        finally { connectionFactory.destroy(); }
    }

    @Test
    void tryConsume_ShouldAllowUpToCapacityAndRejectAfterwards() {
        // capacity = 3, refillRate = 1 per second
        RateLimitProperties.Policy policy = new RateLimitProperties.Policy(3, 1, Duration.ofSeconds(1));
        String key = "test:consume:capacity";

        // Consume 3 tokens (should succeed)
        assertTrue(rateLimiter.tryConsume(key, policy));
        assertTrue(rateLimiter.tryConsume(key, policy));
        assertTrue(rateLimiter.tryConsume(key, policy));

        // 4th token should fail
        assertFalse(rateLimiter.tryConsume(key, policy));
    }

    @Test
    void tryConsume_ShouldRefillTokensOverTime() throws InterruptedException {
        // capacity = 2, refillRate = 2 per second (so 1 token every 500ms)
        RateLimitProperties.Policy policy = new RateLimitProperties.Policy(2, 2, Duration.ofSeconds(1));
        String key = "test:consume:refill";

        // Consume 2 tokens
        assertTrue(rateLimiter.tryConsume(key, policy));
        assertTrue(rateLimiter.tryConsume(key, policy));

        // 3rd token should fail immediately
        assertFalse(rateLimiter.tryConsume(key, policy));

        // Wait for 550ms (enough time to refill 1 token)
        Thread.sleep(550);

        // Should succeed now
        assertTrue(rateLimiter.tryConsume(key, policy));
        
        // But only 1 token was refilled, so next one should fail
        assertFalse(rateLimiter.tryConsume(key, policy));
    }

    @Test
    void tryConsume_ConcurrentRequests_ShouldRespectCapacityAtomically() throws InterruptedException {
        // capacity = 5
        RateLimitProperties.Policy policy = new RateLimitProperties.Policy(5, 1, Duration.ofSeconds(10));
        String key = "test:consume:concurrent";

        int numThreads = 20;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch latch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(numThreads);
        AtomicInteger successfulConsumes = new AtomicInteger(0);

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    latch.await();
                    if (rateLimiter.tryConsume(key, policy)) {
                        successfulConsumes.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        // Release all threads simultaneously
        latch.countDown();
        doneLatch.await(5, TimeUnit.SECONDS);
        executor.shutdown();

        // Exactly 5 requests should have succeeded, no more, no less
        assertEquals(5, successfulConsumes.get());
    }
}
