package com.ticketbox.infrastructure.redis;

import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.DuplicateIdempotencyKeyException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.util.RedisKeyConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class IdempotencyService {
    private static final int MAX_KEY_LENGTH = 128;

    private static final RedisScript<Long> COMPLETE_SCRIPT = RedisScript.of(
            """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                redis.call('set', KEYS[1], ARGV[2], 'PX', ARGV[3])
                return 1
            end
            return 0
            """,
            Long.class
    );

    private static final RedisScript<Long> RELEASE_SCRIPT = RedisScript.of(
            """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            end
            return 0
            """,
            Long.class
    );

    private final StringRedisTemplate redisTemplate;

    public IdempotencyClaim claimOrder(UUID userId, String rawKey)
    {
        String key = validate(rawKey);
        String redisKey = RedisKeyConstants.IDEMPOTENCY_ORDER + userId + ":" + key;
        String token = UUID.randomUUID().toString();

        try {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                    redisKey,
                    token,
                    RedisKeyConstants.TTL_IDEMPOTENCY_PROCESSING
            );

            if (!Boolean.TRUE.equals(acquired)) {
                throw new DuplicateIdempotencyKeyException(key);
            }

            return new IdempotencyClaim(redisKey, token, key);
        } catch (DuplicateIdempotencyKeyException ex) {
            throw ex;
        } catch (DataAccessException ex) {
            throw new AppException(
                    ErrorCode.REDIS_UNAVAILABLE,
                    "Redis is temporarily unavailable. Please retry later."
            );
        }
    }

    public void completeAfterCommit(IdempotencyClaim claim, UUID orderId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            release(claim);
            throw new IllegalStateException(
                    "Idempotency completion must be registered inside a transaction"
            );
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try { complete(claim, orderId); }
                        catch (DataAccessException ignored) { /* DB unique idempotency remains authoritative after commit. */ }
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status != STATUS_COMMITTED) {
                            release(claim);
                        }
                    }
                }
        );
    }

    public void release(IdempotencyClaim claim) {
        try {
            redisTemplate.execute(
                    RELEASE_SCRIPT,
                    List.of(claim.redisKey()),
                    claim.token()
            );
        } catch (DataAccessException ignored) {
        }
    }

    private void complete(IdempotencyClaim claim, UUID orderId) {
        redisTemplate.execute(
                COMPLETE_SCRIPT,
                List.of(claim.redisKey()),
                claim.token(),
                "COMPLETED:" + orderId,
                Long.toString(RedisKeyConstants.TTL_IDEMPOTENCY.toMillis())
        );
    }

    private String validate(String rawKey)
    {
        if(!StringUtils.hasText(rawKey))
        {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Thiếu header Idempotency-Key"
            );
        }

        String key = rawKey.trim();
        if (key.length() > MAX_KEY_LENGTH) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Idempotency-Key không được vượt quá 128 ký tự"
            );
        }

        return key;
    }

    public record IdempotencyClaim(
            String redisKey,
            String token,
            String clientKey
    ){

    }
}
