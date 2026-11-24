package org.ticketbox.ticketing.queue.infrastructure;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.config.RateLimitProperties;
import org.ticketbox.ticketing.infrastructure.redis.RedisKeyConstants;
import org.ticketbox.ticketing.infrastructure.redis.TokenBucketRateLimiter;
import org.ticketbox.ticketing.queue.application.port.QueueRequestLimiter;

import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class RedisQueueRequestLimiter implements QueueRequestLimiter {
    private static final RateLimitProperties.Policy JOIN_POLICY =
            new RateLimitProperties.Policy(20, 10, Duration.ofSeconds(10));
    private static final RateLimitProperties.Policy STATUS_POLICY =
            new RateLimitProperties.Policy(60, 30, Duration.ofSeconds(10));

    private final TokenBucketRateLimiter rateLimiter;

    @Override
    public boolean tryAcquire(UUID userId, Action action) {
        String key = RedisKeyConstants.RATE_LIMIT_USER + userId + ":queue:"
                + action.name().toLowerCase(Locale.ROOT);
        return rateLimiter.tryConsume(key, action == Action.JOIN ? JOIN_POLICY : STATUS_POLICY);
    }
}
