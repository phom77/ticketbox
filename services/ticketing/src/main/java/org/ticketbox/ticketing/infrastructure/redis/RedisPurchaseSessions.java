package org.ticketbox.ticketing.infrastructure.redis;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.order.application.port.PurchaseSessions;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class RedisPurchaseSessions implements PurchaseSessions {
    private final StringRedisTemplate redis;
    private static final RedisScript<Long> RELEASE =
            RedisScript.of(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del',"
                            + " KEYS[1]) else return 0 end",
                    Long.class);

    public RedisPurchaseSessions(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public boolean acquire(String key, String token) {
        return !Boolean.FALSE.equals(
                redis.opsForValue().setIfAbsent(key, token, Duration.ofSeconds(5)));
    }

    public void release(String key, String token) {
        redis.execute(RELEASE, List.of(key), token);
    }

    public Long remainingSeconds(UUID concertId, UUID userId) {
        return redis.getExpire(
                RedisKeyConstants.QUEUE_SESSION + concertId + ":" + userId, TimeUnit.SECONDS);
    }
}
