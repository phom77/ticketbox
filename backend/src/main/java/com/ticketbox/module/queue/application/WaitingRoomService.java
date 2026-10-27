package com.ticketbox.module.queue.application;

import com.ticketbox.infrastructure.redis.RateLimitProperties;
import com.ticketbox.infrastructure.redis.TokenBucketRateLimiter;
import com.ticketbox.module.queue.web.dto.QueueSnapshotResponse;
import java.util.Map;
import java.util.Random;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.module.queue.QueueAccessPort;
import com.ticketbox.module.queue.web.dto.QueueStatusResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.util.RedisKeyConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class WaitingRoomService implements QueueAccessPort {

    private static final RateLimitProperties.Policy JOIN_POLICY =
            new RateLimitProperties.Policy(20, 10, Duration.ofSeconds(10));
    private static final RateLimitProperties.Policy STATUS_POLICY =
            new RateLimitProperties.Policy(60, 30, Duration.ofSeconds(10));

    private static final RedisScript<Long> JOIN_SCRIPT = RedisScript.of(
            """
            if redis.call('get', KEYS[3]) then
                return 0
            end

            redis.call('del', KEYS[4])

            if redis.call('zscore', KEYS[1], ARGV[1]) == false then
                local sequence = redis.call('incr', KEYS[2])
                redis.call('zadd', KEYS[1], sequence, ARGV[1])
            end

            return 1
            """,
            Long.class
    );

    private static final RedisScript<Long> JOIN_WAITING_ROOM_SCRIPT = RedisScript.of(
            """
            if redis.call('get', KEYS[3]) then
                return 0
            end

            if redis.call('exists', KEYS[5]) == 1 then return 2 end
            redis.call('del', KEYS[4])

            if redis.call('zscore', KEYS[1], ARGV[1]) == false then
                local sequence = redis.call('incr', KEYS[2])
                redis.call('zadd', KEYS[1], sequence, ARGV[1])
            end

            return 1
            """,
            Long.class
    );

    private static final RedisScript<List> STATUS_SCRIPT = RedisScript.of(
            """

            local existing_session = redis.call('get', KEYS[3])
            if existing_session then
                local ttl = redis.call('pttl', KEYS[3])
                local expires_at = tonumber(ARGV[2])
                if ttl > 0 then
                    expires_at = expires_at + ttl
                end
                return {'ADMITTED', '', '', '0', existing_session, tostring(expires_at)}
            end

            if redis.call('exists', KEYS[4]) == 1 then
                return {'LEFT', '', '', '', '', ''}
            end

            local rank = redis.call('zrank', KEYS[1], ARGV[1])
            if rank == false then
                return {'EXPIRED', '', '', '', '', ''}
            end

            local active = redis.call('zcard', KEYS[2])
            local capacity = tonumber(ARGV[4])
            -- A shopper who has already been admitted is consuming capacity, but is
            -- no longer in front of anyone in the queue. Keeping those two concepts
            -- separate means the next queued fan is correctly shown as position 1.
            local people_ahead = rank
            local position = people_ahead + 1
            local estimated = math.max(tonumber(ARGV[6]), math.ceil((active + people_ahead) / capacity) * tonumber(ARGV[6]))
            return {'WAITING', tostring(position), tostring(people_ahead), tostring(estimated), '', ''}
            """,
            List.class
    );

    // Both rate and active-session budgets are committed atomically by Redis, across all workers.
    // This deployment uses standalone Redis; these cross-concert keys require a single slot if clustered.
    private static final RedisScript<Long> ADMIT_SCRIPT = RedisScript.of("""
            local clock = redis.call('time')
            local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
            redis.call('zremrangebyscore', KEYS[2], '-inf', now)
            redis.call('zremrangebyscore', KEYS[4], '-inf', now)
            local head = redis.call('zrange', KEYS[1], 0, 0)[1]
            if head ~= ARGV[1] or redis.call('exists', KEYS[3]) == 1 then return 0 end
            if redis.call('zcard', KEYS[2]) >= tonumber(ARGV[5]) or
               redis.call('zcard', KEYS[4]) >= tonumber(ARGV[6]) then return 0 end
            local function tokens(key, rate, burst)
                local old = redis.call('hmget', key, 'tokens', 'at')
                local value = math.min(burst, (tonumber(old[1]) or burst) +
                    math.max(0, now - (tonumber(old[2]) or now)) * rate / 1000)
                return value
            end
            local localTokens = tokens(KEYS[5], tonumber(ARGV[7]), tonumber(ARGV[8]))
            local globalTokens = tokens(KEYS[6], tonumber(ARGV[9]), tonumber(ARGV[10]))
            if localTokens < 1 or globalTokens < 1 then return 0 end
            redis.call('hset', KEYS[5], 'tokens', localTokens - 1, 'at', now)
            redis.call('hset', KEYS[6], 'tokens', globalTokens - 1, 'at', now)
            redis.call('pexpire', KEYS[5], math.max(60000, tonumber(ARGV[8]) / tonumber(ARGV[7]) * 2000))
            redis.call('pexpire', KEYS[6], math.max(60000, tonumber(ARGV[10]) / tonumber(ARGV[9]) * 2000))
            redis.call('zrem', KEYS[1], ARGV[1])
            redis.call('zadd', KEYS[2], now + tonumber(ARGV[4]), ARGV[1])
            redis.call('zadd', KEYS[4], now + tonumber(ARGV[4]), ARGV[2])
            redis.call('psetex', KEYS[3], ARGV[4], ARGV[3])
            return 1
            """, Long.class);

    private static final RedisScript<String> LEAVE_SCRIPT = RedisScript.of("""
            local token = redis.call('get', KEYS[3]) or ''
            redis.call('zrem', KEYS[1], ARGV[1]); redis.call('zrem', KEYS[2], ARGV[1])
            redis.call('del', KEYS[3]); redis.call('psetex', KEYS[4], ARGV[2], '1')
            redis.call('zrem', KEYS[5], ARGV[3])
            for i=6,#KEYS do redis.call('zrem', KEYS[i], ARGV[1]) end
            return token
            """, String.class);
    private static final RedisScript<Long> FINISH_SESSION_SCRIPT = RedisScript.of("""
            if ARGV[4] ~= '' and redis.call('get', KEYS[3]) ~= ARGV[4] then return 0 end
            redis.call('zrem', KEYS[1], ARGV[1]); redis.call('zrem', KEYS[2], ARGV[1])
            redis.call('del', KEYS[3]); redis.call('zrem', KEYS[4], ARGV[3])
            return 1
            """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final QueueMetadataService metadata;
    private final TokenBucketRateLimiter rateLimiter;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    @Value("${ticketbox.queue.admission-capacity:1}")
    private int admissionCapacity = 8;

    @Value("${ticketbox.queue.global-admission-capacity:32}")
    private int globalAdmissionCapacity = 32;
    @Value("${ticketbox.queue.admission-rate:2}")
    private int admissionRate = 2;
    @Value("${ticketbox.queue.admission-burst:2}")
    private int admissionBurst = 2;
    @Value("${ticketbox.queue.global-admission-rate:8}")
    private int globalAdmissionRate = 8;
    @Value("${ticketbox.queue.global-admission-burst:8}")
    private int globalAdmissionBurst = 8;

    @Value("${ticketbox.queue.shopping-session-ttl:PT10M}")
    private Duration sessionTtl = Duration.ofMinutes(10);

    @Value("${ticketbox.queue.estimated-service-seconds:45}")
    private long estimatedServiceSeconds = 45;

    @Value("${ticketbox.queue.waiting-room-open-before:PT1H}")
    private Duration waitingRoomOpenBefore = Duration.ofHours(1);

    @Value("${ticketbox.queue.waiting-presence-ttl:PT1M}")
    private Duration presenceTtl = Duration.ofMinutes(1);

    @jakarta.annotation.PostConstruct
    void validateBudgets() {
        if (admissionCapacity < 1 || globalAdmissionCapacity < 1 || admissionRate < 1 || admissionBurst < 1 ||
                globalAdmissionRate < 1 || globalAdmissionBurst < 1 || sessionTtl.isNegative() || sessionTtl.isZero()) {
            throw new IllegalArgumentException("Queue budgets and session TTL must be positive");
        }
    }

    public QueueStatusResponse join(UUID concertId, UUID userId) {
        consumeRateLimit(userId, "join", JOIN_POLICY);
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        redisTemplate.execute(RedisScript.of("return redis.call('zadd',KEYS[1],'NX',0,ARGV[1])",Long.class),
                List.of("queue:scheduled-concerts"),concertId.toString());

        if (isBeforeSaleStart(concert)) {
            Long joined = redisTemplate.execute(
                    JOIN_WAITING_ROOM_SCRIPT,
                    List.of(waitingRoomKey(concertId), waitingRoomSequenceKey(concertId), sessionKey(concertId, userId), leftKey(concertId, userId), drawStateKey(concertId)),
                    userId.toString()
            );
            if (!Long.valueOf(2).equals(joined)) {
                touchPresence(concertId, userId);
                return waitingRoomStatus(concertId, userId);
            }
        }

        ensureQueueDrawn(concertId);

        String token = UUID.randomUUID().toString();
        redisTemplate.execute(
                JOIN_SCRIPT,
                List.of(queueKey(concertId), sequenceKey(concertId), sessionKey(concertId, userId), leftKey(concertId, userId)),
                userId.toString()
        );
        QueueStatusResponse response = status(concertId, userId, token);
        updatePresence(concertId, userId, response.status());
        return response;
    }

    public QueueStatusResponse status(UUID concertId, UUID userId) {
        consumeRateLimit(userId, "status", STATUS_POLICY);
        return internalStatus(concertId, userId);
    }

    public QueueStatusResponse internalStatus(UUID concertId, UUID userId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (isBeforeSaleStart(concert)) {
            QueueStatusResponse response = waitingRoomStatus(concertId, userId);
            updatePresence(concertId, userId, response.status());
            return response;
        }
        if (!"READY".equals(redisTemplate.opsForValue().get(drawStateKey(concertId)))) {
            QueueStatusResponse response = waitingRoomStatus(concertId, userId);
            updatePresence(concertId, userId, response.status());
            return response;
        }
        QueueStatusResponse response = status(concertId, userId, UUID.randomUUID().toString());
        updatePresence(concertId, userId, response.status());
        return response;
    }

    @org.springframework.transaction.annotation.Transactional
    public QueueStatusResponse leave(UUID concertId, UUID userId) {
        String departedToken = redisTemplate.execute(LEAVE_SCRIPT,
                List.of(queueKey(concertId),activeKey(concertId),sessionKey(concertId,userId),leftKey(concertId,userId),
                        "queue:global-active",waitingRoomKey(concertId),"queue:draw-source:"+concertId,"queue:presence:"+concertId),
                userId.toString(),Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()),concertId+":"+userId);
        eventPublisher.publishEvent(new com.ticketbox.shared.event.UserLeftQueueEvent(concertId,userId,departedToken));
        return new QueueStatusResponse(QueueStatus.LEFT,null,null,null,null,null,0L,0L,0L);
    }

    /** Creates the randomized queue at sale time even if no browser happens to request a status then. */
    @Scheduled(fixedDelayString = "${ticketbox.queue.snapshot-check-interval-ms:1000}")
    public void createDueQueueSnapshots() {
        Set<String> due = redisTemplate.opsForZSet().rangeByScore("queue:scheduled-concerts", 0,
                Instant.now().toEpochMilli(), 0, 128);
        if (due == null) return;
        for (String member : due) {
            try {
                UUID concertId = UUID.fromString(member);
                ConcertView concert = metadata.get(concertId);
                cleanupDisconnectedUsers(concertId);
                if (!"ON_SALE".equals(concert.status()) ||
                        (concert.saleEndAt() != null && concert.saleEndAt().isBefore(OffsetDateTime.now()))) {
                    redisTemplate.opsForZSet().remove("queue:scheduled-concerts", member);
                } else if (!isBeforeSaleStart(concert)) {
                    promoteWaitingUsers(concertId).forEach((userId, status) ->
                            eventPublisher.publishEvent(new QueueAdmissionEvent(concertId, userId, status)));
                }
            } catch (RuntimeException exception) {
                log.warn("Could not prepare queue for {}", member, exception);
            } finally {
                redisTemplate.execute(RedisScript.of("""
                    if redis.call('zscore',KEYS[1],ARGV[1]) then
                        local t=redis.call('time'); local now=t[1]*1000+math.floor(t[2]/1000)
                        redis.call('zadd',KEYS[1],'XX',now+1000,ARGV[1])
                    end
                    return 1
                    """,Long.class),List.of("queue:scheduled-concerts"),member);
            }
        }
    }

    public QueueSnapshotResponse snapshot(UUID concertId) {
        return new QueueSnapshotResponse(concertId, waitingRoomCount(concertId), queueSize(concertId),
                activeShoppers(concertId), OffsetDateTime.now());
    }

    /** Checks only the bounded head of the queue, never every connected session. */
    public Map<UUID, QueueStatusResponse> promoteWaitingUsers(UUID concertId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (isBeforeSaleStart(concert)) return Map.of();
        ensureQueueDrawn(concertId);
        Set<String> candidates = redisTemplate.opsForZSet().range(queueKey(concertId), 0,
                Math.min(Math.max(1, admissionCapacity), 64) - 1);
        Map<UUID, QueueStatusResponse> admitted = new java.util.LinkedHashMap<>();
        if (candidates != null) for (String candidate : candidates) {
            UUID userId = UUID.fromString(candidate);
            Long granted = redisTemplate.execute(ADMIT_SCRIPT,
                    List.of(queueKey(concertId), activeKey(concertId), sessionKey(concertId, userId),
                            "queue:global-active", "queue:admission-budget:" + concertId, "queue:global-admission-budget"),
                    candidate, concertId + ":" + candidate, UUID.randomUUID().toString(),
                    Long.toString(sessionTtl.toMillis()), Integer.toString(admissionCapacity),
                    Integer.toString(globalAdmissionCapacity), Integer.toString(admissionRate),
                    Integer.toString(admissionBurst), Integer.toString(globalAdmissionRate), Integer.toString(globalAdmissionBurst));
            if (Long.valueOf(1).equals(granted)) {
                redisTemplate.opsForZSet().remove("queue:presence:" + concertId, userId.toString());
                admitted.put(userId, status(concertId, userId, ""));
            }
            else break;
        }
        return admitted;
    }

    @Override
    public void validateAccess(UUID concertId, UUID userId, String queueAccessToken) {
        if (queueAccessToken == null || queueAccessToken.isBlank()) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Vui lòng vào phòng chờ trước khi tạo đơn hàng");
        }

        String storedToken = redisTemplate.opsForValue().get(sessionKey(concertId, userId));
        if (!queueAccessToken.equals(storedToken)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Phiên mua vé của bạn không còn hoạt động hoặc đã hết hạn");
        }
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId) {
        finishShoppingSession(concertId,userId,"");
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId, String expectedToken) {
        redisTemplate.execute(
                FINISH_SESSION_SCRIPT,
                List.of(queueKey(concertId), activeKey(concertId), sessionKey(concertId, userId), "queue:global-active"),
                userId.toString(), "", concertId + ":" + userId, expectedToken
        );
    }

    private QueueStatusResponse status(UUID concertId, UUID userId, String candidateToken) {
        List<?> raw = redisTemplate.execute(
                STATUS_SCRIPT,
                List.of(queueKey(concertId), activeKey(concertId), sessionKey(concertId, userId), leftKey(concertId, userId)),
                userId.toString(),
                Long.toString(Instant.now().toEpochMilli()),
                Long.toString(sessionTtl.toMillis()),
                Integer.toString(Math.max(1, admissionCapacity)),
                candidateToken,
                Long.toString(Math.max(1, estimatedServiceSeconds))
        );

        if (raw == null || raw.isEmpty()) {
            throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "Phòng chờ tạm thời không khả dụng");
        }

        QueueStatus status = QueueStatus.valueOf(String.valueOf(raw.get(0)));
        return new QueueStatusResponse(
                status,
                parseInteger(raw.get(1)),
                parseInteger(raw.get(2)),
                parseLong(raw.get(3)),
                blankToNull(raw.get(4)),
                parseExpiresAt(raw.get(5)),
                0L,
                queueSize(concertId),
                activeShoppers(concertId)
        );
    }

    public boolean isStillWaiting(UUID concertId, UUID userId) {
        QueueStatus status = internalStatus(concertId, userId).status();
        return status == QueueStatus.WAITING_ROOM || status == QueueStatus.WAITING;
    }

    private QueueStatusResponse waitingRoomStatus(UUID concertId, UUID userId) {
        if (Boolean.TRUE.equals(redisTemplate.hasKey(leftKey(concertId, userId)))) {
            return new QueueStatusResponse(QueueStatus.LEFT, null, null, null, null, null, 0L, 0L, 0L);
        }
        Long rank = redisTemplate.opsForZSet().rank(waitingRoomKey(concertId), userId.toString());
        if (rank == null) rank = redisTemplate.opsForZSet().rank("queue:draw-source:" + concertId, userId.toString());
        if (rank == null) {
            return new QueueStatusResponse(QueueStatus.EXPIRED, null, null, null, null, null, 0L, 0L, 0L);
        }
        return new QueueStatusResponse(QueueStatus.WAITING_ROOM, null, null, null, null, null, waitingRoomCount(concertId), 0L, 0L);
    }

    private ConcertView validateConcertForWaitingRoom(UUID concertId) {
        ConcertView concert = metadata.get(concertId);
        if (!"ON_SALE".equals(concert.status())) {
            throw new AppException(ErrorCode.CONCERT_NOT_ON_SALE, "Concert hiện không mở bán");
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (concert.saleStartAt() == null || concert.saleStartAt().minus(waitingRoomOpenBefore).isAfter(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "Phòng chờ mở trước thời điểm bán vé một giờ");
        }
        if (concert.saleEndAt() != null && concert.saleEndAt().isBefore(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "Thời gian bán vé đã kết thúc");
        }
        return concert;
    }

    private boolean isBeforeSaleStart(ConcertView concert) {
        return concert.saleStartAt().isAfter(OffsetDateTime.now());
    }

    private void ensureQueueDrawn(UUID concertId) {
        String stateKey = drawStateKey(concertId);
        if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return;
        String lockToken = UUID.randomUUID().toString();
        String lockKey = drawLockKey(concertId);
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, lockToken, Duration.ofSeconds(30));
        if (!Boolean.TRUE.equals(acquired)) {
            throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "Phòng chờ đang chuẩn bị hàng đợi. Vui lòng thử lại");
        }
        String sourceKey = "queue:draw-source:" + concertId;
        String stagingKey = "queue:draw-staging:" + concertId + ":" + lockToken;
        String seedKey = "queue:draw-seed:" + concertId;
        try {
            if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return;
            redisTemplate.execute(RedisScript.of("""
                    if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
                    if redis.call('get', KEYS[2]) ~= 'DRAWING' then
                        if redis.call('exists', KEYS[3]) == 1 then redis.call('rename', KEYS[3], KEYS[4]) end
                        redis.call('set', KEYS[2], 'DRAWING')
                    end
                    redis.call('set', KEYS[5], ARGV[2], 'NX')
                    return 1
                    """, Long.class), List.of(lockKey, stateKey, waitingRoomKey(concertId), sourceKey, seedKey),
                    lockToken, Long.toString(UUID.randomUUID().getMostSignificantBits()));
            Set<String> entrants = redisTemplate.opsForZSet().range(sourceKey, 0, -1);
            List<String> randomized = entrants == null ? new ArrayList<>() : new ArrayList<>(entrants);
            Collections.shuffle(randomized, new Random(Long.parseLong(redisTemplate.opsForValue().get(seedKey))));
            RedisScript<Long> writeBatch = RedisScript.of("""
                    if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
                    redis.call('pexpire', KEYS[1], 30000)
                    for i = 2, #ARGV, 2 do
                        if redis.call('zscore', KEYS[2], ARGV[i]) then
                            redis.call('zadd', KEYS[3], ARGV[i+1], ARGV[i])
                        end
                    end
                    redis.call('pexpire', KEYS[3], 120000)
                    return 1
                    """, Long.class);
            for (int start = 0; start < randomized.size(); start += 256) {
                List<String> args = new ArrayList<>();
                args.add(lockToken);
                for (int index = start; index < Math.min(start + 256, randomized.size()); index++) {
                    args.add(randomized.get(index)); args.add(Integer.toString(index + 1));
                }
                if (!Long.valueOf(1).equals(redisTemplate.execute(writeBatch,
                        List.of(lockKey, sourceKey, stagingKey), args.toArray()))) {
                    throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "Không thể hoàn tất hàng đợi");
                }
            }
            Long published = redisTemplate.execute(RedisScript.of("""
                    if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
                    redis.call('del', KEYS[3])
                    if redis.call('exists', KEYS[2]) == 1 then
                        redis.call('rename', KEYS[2], KEYS[3]); redis.call('persist', KEYS[3])
                    end
                    redis.call('set', KEYS[4], ARGV[2])
                    redis.call('set', KEYS[5], 'READY')
                    redis.call('del', KEYS[6])
                    return 1
                    """, Long.class), List.of(lockKey, stagingKey, queueKey(concertId), sequenceKey(concertId), stateKey, sourceKey),
                    lockToken, Integer.toString(randomized.size()));
            if (!Long.valueOf(1).equals(published)) throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "Không thể hoàn tất hàng đợi");
        } finally {
            redisTemplate.execute(RedisScript.of("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", Long.class),
                    List.of(lockKey), lockToken);
        }
    }

    private void touchPresence(UUID concertId, UUID userId) {
        redisTemplate.opsForZSet().add("queue:presence:" + concertId, userId.toString(),
                Instant.now().plus(presenceTtl).toEpochMilli());
    }

    private void updatePresence(UUID concertId, UUID userId, QueueStatus status) {
        if (status == QueueStatus.WAITING || status == QueueStatus.WAITING_ROOM) touchPresence(concertId, userId);
        else redisTemplate.opsForZSet().remove("queue:presence:" + concertId, userId.toString());
    }

    private void cleanupDisconnectedUsers(UUID concertId) {
        String presenceKey = "queue:presence:" + concertId;
        Set<String> expired = redisTemplate.opsForZSet().rangeByScore(presenceKey, 0,
                Instant.now().toEpochMilli(), 0, 64);
        if (expired != null) for (String member : expired) {
            // Atomically claim only if the lease has not been renewed since the initial read.
            Long removed = redisTemplate.execute(RedisScript.of("""
                    local score = redis.call('zscore', KEYS[1], ARGV[1])
                    if score and tonumber(score) <= tonumber(ARGV[2]) then
                        if redis.call('get', KEYS[5]) then
                            redis.call('zrem', KEYS[1], ARGV[1]); return 0
                        end
                        redis.call('psetex', KEYS[6], 600000, '1')
                        redis.call('zrem', KEYS[1], ARGV[1])
                        redis.call('zrem', KEYS[2], ARGV[1])
                        redis.call('zrem', KEYS[3], ARGV[1])
                        redis.call('zrem', KEYS[4], ARGV[1])
                        return 1
                    end
                    return 0
                    """, Long.class), List.of(presenceKey, queueKey(concertId), waitingRoomKey(concertId),
                    "queue:draw-source:" + concertId, sessionKey(concertId, UUID.fromString(member)),
                    leftKey(concertId, UUID.fromString(member))), member, Long.toString(Instant.now().toEpochMilli()));
            if (Long.valueOf(1).equals(removed)) {
                eventPublisher.publishEvent(new com.ticketbox.shared.event.UserLeftQueueEvent(concertId, UUID.fromString(member)));
            }
        }
    }

    private void consumeRateLimit(UUID userId, String action, RateLimitProperties.Policy policy) {
        String key = RedisKeyConstants.RATE_LIMIT_USER + userId + ":queue:" + action;
        if (!rateLimiter.tryConsume(key, policy)) {
            throw new AppException(ErrorCode.RATE_LIMIT_EXCEEDED, "Bạn gửi quá nhiều yêu cầu vào hàng chờ. Vui lòng thử lại sau");
        }
    }

    private String queueKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_CONCERT + concertId;
    }

    private String sequenceKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_SEQUENCE + concertId;
    }

    private String waitingRoomKey(UUID concertId) {
        return RedisKeyConstants.WAITING_ROOM_CONCERT + concertId;
    }

    private String waitingRoomSequenceKey(UUID concertId) {
        return RedisKeyConstants.WAITING_ROOM_SEQUENCE + concertId;
    }

    private String drawStateKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_DRAW_STATE + concertId;
    }

    private String drawLockKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_DRAW_LOCK + concertId;
    }

    private String activeKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_ACTIVE + concertId;
    }

    private String sessionKey(UUID concertId, UUID userId) {
        return RedisKeyConstants.QUEUE_SESSION + concertId + ":" + userId;
    }

    private String leftKey(UUID concertId, UUID userId) {
        return RedisKeyConstants.QUEUE_LEFT + concertId + ":" + userId;
    }

    private long waitingRoomCount(UUID concertId) {
        return zCard(waitingRoomKey(concertId));
    }

    private long queueSize(UUID concertId) {
        return zCard(queueKey(concertId));
    }

    private long activeShoppers(UUID concertId) {
        Long count = redisTemplate.opsForZSet().count(activeKey(concertId), Instant.now().toEpochMilli(), Double.POSITIVE_INFINITY);
        return count == null ? 0 : count;
    }

    private long zCard(String key) {
        Long value = redisTemplate.opsForZSet().zCard(key);
        return value == null ? 0L : value;
    }

    private Integer parseInteger(Object value) {
        String text = blankToNull(value);
        return text == null ? null : Integer.valueOf(text);
    }

    private Long parseLong(Object value) {
        String text = blankToNull(value);
        return text == null ? null : Long.valueOf(text);
    }

    private OffsetDateTime parseExpiresAt(Object value) {
        Long millis = parseLong(value);
        return millis == null ? null : OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC);
    }

    private String blankToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value);
        return text.isBlank() ? null : text;
    }
}
