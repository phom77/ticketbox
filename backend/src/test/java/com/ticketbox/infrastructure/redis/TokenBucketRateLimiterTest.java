package com.ticketbox.infrastructure.redis;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TokenBucketRateLimiterTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    private TokenBucketRateLimiter rateLimiter;
    private RateLimitProperties.Policy policy;

    @BeforeEach
    void setUp() {
        rateLimiter = new TokenBucketRateLimiter(redisTemplate);
        policy = new RateLimitProperties.Policy(10, 1, Duration.ofSeconds(1));
    }

    @Test
    void tryConsume_RedisReturnsOne_ShouldReturnTrue() {
        when(redisTemplate.execute(any(RedisScript.class), anyList(), anyString(), anyString(), anyString()))
                .thenReturn(1L);

        boolean result = rateLimiter.tryConsume("test-key", policy);

        assertTrue(result, "Should return true when Redis script returns 1");
    }

    @Test
    void tryConsume_RedisReturnsZero_ShouldReturnFalse() {
        when(redisTemplate.execute(any(RedisScript.class), anyList(), anyString(), anyString(), anyString()))
                .thenReturn(0L);

        boolean result = rateLimiter.tryConsume("test-key", policy);

        assertFalse(result, "Should return false when Redis script returns 0");
    }

    @Test
    void tryConsume_RedisThrowsException_ShouldReturnRetryableUnavailable() {
        when(redisTemplate.execute(any(RedisScript.class), anyList(), anyString(), anyString(), anyString()))
                .thenThrow(new RedisConnectionFailureException("Connection refused"));

        var error = org.junit.jupiter.api.Assertions.assertThrows(com.ticketbox.shared.exception.AppException.class,
                () -> rateLimiter.tryConsume("test-key", policy));
        org.junit.jupiter.api.Assertions.assertEquals(com.ticketbox.shared.exception.ErrorCode.REDIS_UNAVAILABLE,
                error.getErrorCode());
    }
}
