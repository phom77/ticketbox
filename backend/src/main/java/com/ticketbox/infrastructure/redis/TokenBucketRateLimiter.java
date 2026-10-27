package com.ticketbox.infrastructure.redis;

import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TokenBucketRateLimiter {
    private static final RedisScript<Long> TOKEN_BUCKET_SCRIPT = RedisScript.of(
            """
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refill_tokens = tonumber(ARGV[2])
            local refill_period_ms = tonumber(ARGV[3])

            local redis_time = redis.call('TIME')
            local now_ms = redis_time[1] * 1000
                    + math.floor(redis_time[2] / 1000)

            local values = redis.call(
                    'HMGET',
                    key,
                    'tokens',
                    'last_refill_ms'
            )

            local tokens = tonumber(values[1])
            local last_refill_ms = tonumber(values[2])

            if tokens == nil or last_refill_ms == nil then
                tokens = capacity
                last_refill_ms = now_ms
            else
                local elapsed_ms = math.max(0, now_ms - last_refill_ms)
                local refilled_tokens = elapsed_ms * (refill_tokens / refill_period_ms)
                if refilled_tokens > 0 then
                    tokens = math.min(capacity, tokens + refilled_tokens)
                    last_refill_ms = now_ms
                end
            end

            local allowed = 0
            if tokens >= 1 then
                tokens = tokens - 1
                allowed = 1
            end

            redis.call(
                    'HSET',
                    key,
                    'tokens',
                    tokens,
                    'last_refill_ms',
                    last_refill_ms
            )

            local full_refill_periods =
                    math.ceil(capacity / refill_tokens)
            local ttl_ms =
                    math.max(refill_period_ms, full_refill_periods
                    * refill_period_ms * 2)

            redis.call('PEXPIRE', key, ttl_ms)
            return allowed
            """,
            Long.class
    );

    private final StringRedisTemplate redisTemplate;

    public boolean tryConsume(
            String redisKey,
            RateLimitProperties.Policy policy
    ) {
        try {
            Long result = redisTemplate.execute(
                    TOKEN_BUCKET_SCRIPT,
                    List.of(redisKey),
                    Long.toString(policy.capacity()),
                    Long.toString(policy.refillTokens()),
                    Long.toString(policy.refillPeriod().toMillis())
            );

            return Long.valueOf(1L).equals(result);
        } catch (Exception ex) {
            log.warn("Redis rate limiter unavailable: {}", ex.getClass().getSimpleName());
            throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "Hệ thống điều tiết đang bận. Vui lòng thử lại sau");
        }
    }
}

