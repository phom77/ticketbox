package org.ticketbox.ticketing.queue.infrastructure;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.config.RateLimitProperties;
import org.ticketbox.ticketing.infrastructure.redis.RedisKeyConstants;
import org.ticketbox.ticketing.infrastructure.redis.TokenBucketRateLimiter;
import org.ticketbox.ticketing.queue.application.QueueAdmissionEvent;
import org.ticketbox.ticketing.queue.application.QueueMetadataService;
import org.ticketbox.ticketing.queue.application.dto.QueueSnapshotResponse;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;
import org.ticketbox.ticketing.queue.application.port.QueueAccessPort;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy;
import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Service
@RequiredArgsConstructor
@Slf4j
public class WaitingRoomService
        implements QueueAccessPort,
                org.ticketbox.ticketing.queue.application.port.WaitingRoomOperations {

    private static final RateLimitProperties.Policy JOIN_POLICY =
            new RateLimitProperties.Policy(20, 10, Duration.ofSeconds(10));
    private static final RateLimitProperties.Policy STATUS_POLICY =
            new RateLimitProperties.Policy(60, 30, Duration.ofSeconds(10));
    private static final int ADMISSION_BATCH = 8;
    private static final String SCHEDULED_CONCERTS = "queue:scheduled-concerts";
    private static final String SCHEDULER_LOCK = "queue:adaptive:scheduler";
    private static final String SCHEDULER_CURSOR = "queue:adaptive:cursor";
    private static final RedisScript<Long> RELEASE_LOCK = RedisScript.of("""
            if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
            return 0
            """, Long.class);
    private static final long LAST_OPENING_SCORE = (1L << 52) - 1;

    private static final RedisScript<String> OPENING_SEED_SCRIPT = RedisScript.of("""
if redis.call('exists', KEYS[1]) == 1 then return '' end
local seed = redis.call('get', KEYS[2])
if seed then return seed end
if redis.call('exists', KEYS[3]) == 1 then return '' end
redis.call('psetex', KEYS[2], ARGV[2], ARGV[1])
return ARGV[1]
""", String.class);

    private static final String JOIN_PRESENCE = """
local presenceTtl = tonumber(ARGV[2])
if presenceTtl > 0 then
    local clock = redis.call('time')
    local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
    local deadline = redis.call('zscore', KEYS[5], ARGV[1])
    if deadline and tonumber(deadline) <= now then redis.call('zrem', KEYS[1], ARGV[1]) end
    redis.call('zadd', KEYS[5], now + presenceTtl, ARGV[1])
end
""";

    private static final RedisScript<Long> JOIN_SCRIPT =
            RedisScript.of(
                    """
                    if redis.call('get', KEYS[3]) then
                        return 0
                    end

                    redis.call('del', KEYS[4])
                    """ + JOIN_PRESENCE + """

                    if redis.call('zscore', KEYS[1], ARGV[1]) == false then
                        local sequence = redis.call('incr', KEYS[2])
                        redis.call('zadd', KEYS[1], sequence, ARGV[1])
                    end

                    return 1
                    """,
                    Long.class);

    private static final RedisScript<Long> JOIN_WAITING_ROOM_SCRIPT =
            RedisScript.of(
                    """
                    if redis.call('get', KEYS[3]) then
                        return 0
                    end

                    if redis.call('exists', KEYS[6]) == 1 then return 2 end
                    redis.call('del', KEYS[4])
                    """ + JOIN_PRESENCE + """

                    if redis.call('zscore', KEYS[1], ARGV[1]) == false then
                        local priority = ARGV[3]
                        if priority == '' then priority = redis.call('incr', KEYS[2]) end
                        redis.call('zadd', KEYS[1], priority, ARGV[1])
                    end

                    return 1
                    """,
                    Long.class);

    private static final RedisScript<List> STATUS_SCRIPT =
            RedisScript.of(
                    """
local now = tonumber(ARGV[2])
local presenceTtl = tonumber(ARGV[3])
if presenceTtl > 0 then
    local clock = redis.call('time')
    now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
end
local function response(status, position, ahead, estimate, token, expiry)
    local result = {status, position, ahead, estimate, token, expiry}
    if presenceTtl > 0 then
        local roomSize = 0
        if status == 'WAITING_ROOM' then
            roomSize = redis.call('zcard', KEYS[6]) + redis.call('zcard', KEYS[7])
        end
        result[7] = tostring(roomSize)
        result[8] = tostring(redis.call('zcard', KEYS[1]))
        result[9] = tostring(redis.call('zcount', KEYS[2], '(' .. now, '+inf'))
    end
    return result
end
local existing_session = redis.call('get', KEYS[3])
if existing_session then
    local ttl = redis.call('pttl', KEYS[3])
    local expires_at = now
    if ttl > 0 then
        expires_at = expires_at + ttl
    end
    return response('ADMITTED', '', '', '0', existing_session, tostring(expires_at))
end

if redis.call('exists', KEYS[4]) == 1 then
    return response('LEFT', '', '', '', '', '')
end

local waitingRoom = presenceTtl > 0 and redis.call('get', KEYS[8]) ~= 'READY'
local rank
if waitingRoom then
    rank = redis.call('zrank', KEYS[6], ARGV[1]) or redis.call('zrank', KEYS[7], ARGV[1])
else
    rank = redis.call('zrank', KEYS[1], ARGV[1])
end
if rank == false then
    return response('EXPIRED', '', '', '', '', '')
end
if presenceTtl > 0 then
    local deadline = redis.call('zscore', KEYS[5], ARGV[1])
    if deadline and tonumber(deadline) <= now then return response('EXPIRED', '', '', '', '', '') end
    redis.call('zadd', KEYS[5], now + presenceTtl, ARGV[1])
    if waitingRoom then return response('WAITING_ROOM', '', '', '', '', '') end
end

local active = redis.call('zcard', KEYS[2])
local capacity = tonumber(ARGV[4])
-- A shopper who has already been admitted is consuming capacity, but is
-- no longer in front of anyone in the queue. Keeping those two concepts
-- separate means the next queued fan is correctly shown as position 1.
local people_ahead = rank
local position = people_ahead + 1
local estimated = math.max(tonumber(ARGV[5]), math.ceil((active + people_ahead) / capacity) * tonumber(ARGV[5]))
if presenceTtl > 0 then
    local rate = tonumber(redis.call('hget', KEYS[9], 'rate')) or 5
    local shared = tonumber(redis.call('hget', KEYS[10], 'rate')) or rate
    estimated = math.ceil(position / math.max(1, math.min(rate, shared)))
end
return response('WAITING', tostring(position), tostring(people_ahead), tostring(estimated), '', '')
""",
                    List.class);

    // Both rate and active-session budgets are committed atomically by Redis, across all workers.
    // This deployment uses standalone Redis; these cross-concert keys require a single slot if
    // clustered.
    private static final RedisScript<Long> ADMIT_SCRIPT =
            RedisScript.of(
                    """
local clock = redis.call('time')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('zremrangebyscore', KEYS[2], '-inf', now)
redis.call('zremrangebyscore', KEYS[4], '-inf', now)
local head = redis.call('zrange', KEYS[1], 0, 0)[1]
if head ~= ARGV[1] or redis.call('exists', KEYS[3]) == 1 then return 0 end
if ARGV[11] == 'true' then
    local deadline = redis.call('zscore', KEYS[7], ARGV[1])
    if deadline and tonumber(deadline) <= now then
        redis.call('zrem', KEYS[1], ARGV[1])
        redis.call('zrem', KEYS[7], ARGV[1])
        redis.call('psetex', KEYS[8], ARGV[12], '1')
        return -1
    end
end
local capacity = tonumber(ARGV[5])
local localRate, localBurst = tonumber(ARGV[7]), tonumber(ARGV[8])
local sharedRate, sharedBurst = tonumber(ARGV[9]), tonumber(ARGV[10])
if ARGV[11] == 'true' then
    local policy = redis.call('hmget', KEYS[9], 'capacity', 'rate')
    capacity = tonumber(policy[1]) or 0
    localRate = tonumber(policy[2]) or 0
    sharedRate = tonumber(redis.call('hget', KEYS[10], 'rate')) or 0
    localBurst, sharedBurst = localRate, sharedRate
elseif redis.call('zcard', KEYS[4]) >= tonumber(ARGV[6]) then
    return 0
end
if localRate <= 0 or sharedRate <= 0 or redis.call('zcard', KEYS[2]) >= capacity then
    return 0
end
local function tokens(key, rate, burst)
    local old = redis.call('hmget', key, 'tokens', 'at')
    local value = math.min(burst, (tonumber(old[1]) or burst) +
        math.max(0, now - (tonumber(old[2]) or now)) * rate / 1000)
    return value
end
local localTokens = tokens(KEYS[5], localRate, localBurst)
local globalTokens = tokens(KEYS[6], sharedRate, sharedBurst)
if localTokens < 1 or globalTokens < 1 then return 0 end
redis.call('hset', KEYS[5], 'tokens', localTokens - 1, 'at', now)
redis.call('hset', KEYS[6], 'tokens', globalTokens - 1, 'at', now)
redis.call('pexpire', KEYS[5], math.max(60000, localBurst / localRate * 2000))
redis.call('pexpire', KEYS[6], math.max(60000, sharedBurst / sharedRate * 2000))
redis.call('zrem', KEYS[1], ARGV[1])
redis.call('zrem', KEYS[7], ARGV[1])
redis.call('zadd', KEYS[2], now + tonumber(ARGV[4]), ARGV[1])
redis.call('zadd', KEYS[4], now + tonumber(ARGV[4]), ARGV[2])
redis.call('psetex', KEYS[3], ARGV[4], ARGV[3])
if ARGV[11] == 'true' and redis.call('zcard', KEYS[1]) == 0 then
    redis.call('del', KEYS[9])
end
return 1
""",
                    Long.class);

    private static final RedisScript<String> LEAVE_SCRIPT =
            RedisScript.of(
                    """
                    local token = redis.call('get', KEYS[3]) or ''
                    redis.call('zrem', KEYS[1], ARGV[1]); redis.call('zrem', KEYS[2], ARGV[1])
                    redis.call('del', KEYS[3]); redis.call('psetex', KEYS[4], ARGV[2], '1')
                    redis.call('zrem', KEYS[5], ARGV[3])
                    for i=6,8 do redis.call('zrem', KEYS[i], ARGV[1]) end
                    local draw = redis.call('get', KEYS[9])
                    if draw then redis.call('zrem', ARGV[4] .. draw, ARGV[1]) end
                    if redis.call('zcard', KEYS[1]) == 0 then redis.call('del', KEYS[10]) end
                    return token
                    """,
                    String.class);
    private static final RedisScript<List> EXPIRED_PRESENCE = RedisScript.of("""
            local clock = redis.call('time')
            local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
            return redis.call('zrangebyscore', KEYS[1], '-inf', now, 'LIMIT', 0, 64)
            """, List.class);

    private static final RedisScript<Long> REMOVE_EXPIRED = RedisScript.of("""
            local now = tonumber(ARGV[2])
            if ARGV[3] == 'true' then
                local t = redis.call('time')
                now = t[1] * 1000 + math.floor(t[2] / 1000)
            end
            local score = redis.call('zscore', KEYS[1], ARGV[1])
            if not score or tonumber(score) > now then return 0 end
            redis.call('zrem', KEYS[1], ARGV[1])
            if redis.call('get', KEYS[5]) then return 0 end
            redis.call('psetex', KEYS[6], ARGV[4], '1')
            for i=2,4 do redis.call('zrem', KEYS[i], ARGV[1]) end
            local draw = redis.call('get', KEYS[7])
            if draw then redis.call('zrem', ARGV[5] .. draw, ARGV[1]) end
            if redis.call('zcard', KEYS[2]) == 0 then redis.call('del', KEYS[8]) end
            return 1
            """, Long.class);

    private static final RedisScript<Long> FINISH_SESSION_SCRIPT =
            RedisScript.of(
                    """
                    if ARGV[3] ~= '' and redis.call('get', KEYS[3]) ~= ARGV[3] then return 0 end
                    redis.call('zrem', KEYS[1], ARGV[1]); redis.call('zrem', KEYS[2], ARGV[1])
                    redis.call('del', KEYS[3]); redis.call('zrem', KEYS[4], ARGV[2])
                    redis.call('zrem', KEYS[5], ARGV[1])
                    if redis.call('zcard', KEYS[1]) == 0 then redis.call('del', KEYS[6]) end
                    return 1
                    """,
                    Long.class);

    private final StringRedisTemplate redisTemplate;
    private final QueueMetadataService metadata;
    private final TokenBucketRateLimiter rateLimiter;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;
    private final RedisAdmissionControl admissionControl;

    @Value("${ticketbox.queue.adaptive-enabled:false}")
    private boolean adaptiveEnabled;

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

    @Value("${ticketbox.queue.adaptive-presence-ttl:PT3M}")
    private Duration adaptivePresenceTtl = Duration.ofMinutes(3);

    @jakarta.annotation.PostConstruct
    void validateBudgets() {
        if (admissionCapacity < 1
                || globalAdmissionCapacity < 1
                || admissionRate < 1
                || admissionBurst < 1
                || globalAdmissionRate < 1
                || globalAdmissionBurst < 1
                || sessionTtl.isNegative()
                || sessionTtl.isZero()
                || (adaptiveEnabled && adaptivePresenceTtl.toMillis() <= 0)) {
            throw new IllegalArgumentException("Queue budgets and session TTL must be positive");
        }
    }

    public QueueStatusResponse join(UUID concertId, UUID userId) {
        consumeRateLimit(userId, "join", JOIN_POLICY);
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        redisTemplate.execute(
                RedisScript.of("return redis.call('zadd',KEYS[1],'NX',0,ARGV[1])", Long.class),
                List.of(SCHEDULED_CONCERTS),
                concertId.toString());

        if (isBeforeSaleStart(concert)) {
            String priority = openingPriority(concert, userId);
            Long joined =
                    redisTemplate.execute(
                            JOIN_WAITING_ROOM_SCRIPT,
                            List.of(
                                    waitingRoomKey(concertId),
                                    waitingRoomSequenceKey(concertId),
                                    sessionKey(concertId, userId),
                                    leftKey(concertId, userId),
                                    presenceKey(concertId),
                                    drawStateKey(concertId)),
                            userId.toString(), adaptivePresenceMillis(), priority);
            if (!Long.valueOf(2).equals(joined)) {
                if (adaptiveEnabled) return readStatus(concertId, userId);
                touchPresence(concertId, userId);
                return waitingRoomStatus(concertId, userId);
            }
        }

        ensureQueueDrawn(concertId);

        redisTemplate.execute(
                JOIN_SCRIPT,
                List.of(
                        queueKey(concertId),
                        sequenceKey(concertId),
                        sessionKey(concertId, userId),
                        leftKey(concertId, userId),
                        presenceKey(concertId)),
                userId.toString(), adaptivePresenceMillis());
        QueueStatusResponse response = readStatus(concertId, userId);
        if (!adaptiveEnabled) updatePresence(concertId, userId, response.status());
        return response;
    }

    public QueueStatusResponse status(UUID concertId, UUID userId) {
        consumeRateLimit(userId, "status", STATUS_POLICY);
        return internalStatus(concertId, userId);
    }

    public QueueStatusResponse internalStatus(UUID concertId, UUID userId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (adaptiveEnabled) return readStatus(concertId, userId);
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
        QueueStatusResponse response = readStatus(concertId, userId);
        updatePresence(concertId, userId, response.status());
        return response;
    }

    @org.springframework.transaction.annotation.Transactional
    public QueueStatusResponse leave(UUID concertId, UUID userId) {
        String departedToken =
                redisTemplate.execute(
                        LEAVE_SCRIPT,
                        List.of(
                                queueKey(concertId),
                                activeKey(concertId),
                                sessionKey(concertId, userId),
                                leftKey(concertId, userId),
                                "queue:global-active",
                                waitingRoomKey(concertId),
                                "queue:draw-source:" + concertId,
                                presenceKey(concertId),
                                drawLockKey(concertId),
                                RedisAdmissionControl.concertPolicy(concertId)),
                        userId.toString(),
                        Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()),
                        concertId + ":" + userId,
                        drawStagingPrefix(concertId));
        eventPublisher.publishEvent(
                new com.ticketbox.shared.event.UserLeftQueueEvent(
                        concertId, userId, departedToken));
        return new QueueStatusResponse(QueueStatus.LEFT, null, null, null, null, null, 0L, 0L, 0L);
    }

    /**
     * Creates the randomized queue at sale time even if no browser happens to request a status
     * then.
     */
    @Scheduled(fixedDelayString = "${ticketbox.queue.snapshot-check-interval-ms:1000}")
    public void createDueQueueSnapshots() {
        if (!adaptiveEnabled) {
            processDueConcerts();
            return;
        }
        String lease = UUID.randomUUID().toString();
        if (!Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(
                SCHEDULER_LOCK, lease, Duration.ofSeconds(10)))) return;
        try {
            processDueConcerts();
        } finally {
            redisTemplate.execute(RELEASE_LOCK, List.of(SCHEDULER_LOCK), lease);
        }
    }

    private void processDueConcerts() {
        Set<String> due = redisTemplate.opsForZSet().rangeByScore(
                SCHEDULED_CONCERTS, 0, Instant.now().toEpochMilli(), 0, 128);
        if (due == null || due.isEmpty()) return;
        List<String> ready = new ArrayList<>();
        long window = adaptiveEnabled ? admissionControl.completedWindow() : 0;
        for (String member : due) {
            try {
                UUID concertId = UUID.fromString(member);
                ConcertView concert = metadata.get(concertId);
                cleanupDisconnectedUsers(concertId);
                if (!"ON_SALE".equals(concert.status())
                        || (concert.saleEndAt() != null && concert.saleEndAt().isBefore(OffsetDateTime.now()))) {
                    redisTemplate.opsForZSet().remove(SCHEDULED_CONCERTS, member);
                } else if (!isBeforeSaleStart(concert)) {
                    if (adaptiveEnabled) {
                        ensureQueueDrawn(concertId);
                        admissionControl.refreshConcert(concertId, queueKey(concertId),
                                presenceKey(concertId), window);
                        if (queueSize(concertId) > 0) ready.add(member);
                    } else {
                        publishAdmissions(concertId, promoteWaitingUsers(concertId));
                    }
                }
            } catch (RuntimeException exception) {
                log.warn("Could not prepare queue for {}", member, exception);
            } finally {
                redisTemplate.execute(
                        RedisScript.of("""
                                if redis.call('zscore', KEYS[1], ARGV[1]) then
                                    local t = redis.call('time')
                                    local now = t[1] * 1000 + math.floor(t[2] / 1000)
                                    redis.call('zadd', KEYS[1], 'XX', now + 1000, ARGV[1])
                                end
                                return 1
                                """, Long.class),
                        List.of(SCHEDULED_CONCERTS), member);
            }
        }
        if (!ready.isEmpty()) {
            admissionControl.refreshShared(window);
            serveReadyConcerts(ready);
        }
    }

    private void serveReadyConcerts(List<String> ready) {
        // Rotate the first turn even when only one shared grant is available.
        Collections.sort(ready);
        String previous = redisTemplate.opsForValue().get(SCHEDULER_CURSOR);
        if (previous != null) {
            int index = Collections.binarySearch(ready, previous);
            int next = index >= 0 ? index + 1 : -index - 1;
            Collections.rotate(ready, -next);
        }
        redisTemplate.opsForValue().set(SCHEDULER_CURSOR, ready.getFirst(), Duration.ofMinutes(5));

        // Concerts that still have budget get another turn without waiting for the next tick.
        for (int round = 0; round < 8 && !ready.isEmpty(); round++) {
            List<String> nextTurn = new ArrayList<>();
            for (String member : ready) {
                UUID concertId = UUID.fromString(member);
                try {
                    var grants = grantBatch(concertId, ADMISSION_BATCH);
                    publishAdmissions(concertId, grants);
                    if (grants.size() == ADMISSION_BATCH) nextTurn.add(member);
                } catch (RuntimeException exception) {
                    log.warn("Could not admit queued users for {}", member, exception);
                }
            }
            ready = nextTurn;
        }
    }

    private void publishAdmissions(UUID concertId, Map<UUID, QueueStatusResponse> admitted) {
        admitted.forEach((userId, status) ->
                eventPublisher.publishEvent(new QueueAdmissionEvent(concertId, userId, status)));
    }

    public QueueSnapshotResponse snapshot(UUID concertId) {
        return new QueueSnapshotResponse(
                concertId,
                waitingRoomCount(concertId),
                queueSize(concertId),
                activeShoppers(concertId),
                OffsetDateTime.now());
    }

    /** Checks only the bounded head of the queue, never every connected session. */
    public Map<UUID, QueueStatusResponse> promoteWaitingUsers(UUID concertId) {
        ConcertView concert = validateConcertForWaitingRoom(concertId);
        if (isBeforeSaleStart(concert)) return Map.of();
        ensureQueueDrawn(concertId);
        if (adaptiveEnabled) {
            long window = admissionControl.completedWindow();
            admissionControl.refreshShared(window);
            admissionControl.refreshConcert(concertId, queueKey(concertId), presenceKey(concertId), window);
        }
        return grantBatch(concertId, adaptiveEnabled ? ADMISSION_BATCH
                : Math.min(Math.max(1, admissionCapacity), 64));
    }

    private Map<UUID, QueueStatusResponse> grantBatch(UUID concertId, int limit) {
        Set<String> candidates = redisTemplate.opsForZSet().range(queueKey(concertId), 0, limit - 1);
        Map<UUID, QueueStatusResponse> admitted = new java.util.LinkedHashMap<>();
        if (candidates != null)
            for (String candidate : candidates) {
                UUID userId = UUID.fromString(candidate);
                Long granted =
                        redisTemplate.execute(
                                ADMIT_SCRIPT,
                                List.of(
                                        queueKey(concertId),
                                        activeKey(concertId),
                                        sessionKey(concertId, userId),
                                        "queue:global-active",
                                        "queue:admission-budget:" + concertId,
                                        "queue:global-admission-budget",
                                        presenceKey(concertId),
                                        leftKey(concertId, userId),
                                        RedisAdmissionControl.concertPolicy(concertId),
                                        RedisAdmissionControl.SHARED_POLICY),
                                candidate,
                                concertId + ":" + candidate,
                                UUID.randomUUID().toString(),
                                Long.toString(sessionTtl.toMillis()),
                                Integer.toString(admissionCapacity),
                                Integer.toString(globalAdmissionCapacity),
                                Integer.toString(admissionRate),
                                Integer.toString(admissionBurst),
                                Integer.toString(globalAdmissionRate),
                                Integer.toString(globalAdmissionBurst), Boolean.toString(adaptiveEnabled),
                                Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()));
                if (Long.valueOf(1).equals(granted)) {
                    admitted.put(userId, readStatus(concertId, userId));
                } else if (!Long.valueOf(-1).equals(granted)) break;
            }
        return admitted;
    }

    @Override
    public void validateAccess(UUID concertId, UUID userId, String queueAccessToken) {
        org.ticketbox.ticketing.queue.domain.ShoppingSession.requireToken(queueAccessToken);
        String storedToken = redisTemplate.opsForValue().get(sessionKey(concertId, userId));
        new org.ticketbox.ticketing.queue.domain.ShoppingSession(concertId, userId, storedToken)
                .authorize(queueAccessToken);
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId) {
        finishShoppingSession(concertId, userId, "");
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId, String expectedToken) {
        redisTemplate.execute(
                FINISH_SESSION_SCRIPT,
                List.of(
                        queueKey(concertId),
                        activeKey(concertId),
                        sessionKey(concertId, userId),
                        "queue:global-active",
                        presenceKey(concertId),
                        RedisAdmissionControl.concertPolicy(concertId)),
                userId.toString(),
                concertId + ":" + userId,
                expectedToken);
    }

    private QueueStatusResponse readStatus(UUID concertId, UUID userId) {
        List<?> raw =
                redisTemplate.execute(
                        STATUS_SCRIPT,
                        List.of(
                                queueKey(concertId),
                                activeKey(concertId),
                                sessionKey(concertId, userId),
                                leftKey(concertId, userId),
                                presenceKey(concertId), waitingRoomKey(concertId),
                                "queue:draw-source:" + concertId, drawStateKey(concertId),
                                RedisAdmissionControl.concertPolicy(concertId), RedisAdmissionControl.SHARED_POLICY),
                        userId.toString(),
                        Long.toString(Instant.now().toEpochMilli()),
                        adaptivePresenceMillis(),
                        Integer.toString(Math.max(1, admissionCapacity)),
                        Long.toString(Math.max(1, estimatedServiceSeconds)));

        if (raw == null || raw.isEmpty()) {
            throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.unavailable");
        }

        QueueStatus status = QueueStatus.valueOf(String.valueOf(raw.get(0)));
        Integer position = parseInteger(raw.get(1));
        return new QueueStatusResponse(
                status,
                position,
                parseInteger(raw.get(2)),
                parseLong(raw.get(3)),
                blankToNull(raw.get(4)),
                parseExpiresAt(raw.get(5)),
                adaptiveEnabled ? parseLong(raw.get(6)) : 0L,
                adaptiveEnabled ? parseLong(raw.get(7)) : queueSize(concertId),
                adaptiveEnabled ? parseLong(raw.get(8)) : activeShoppers(concertId),
                adaptiveEnabled ? AdmissionPolicy.pollAfterMs(status, position) : null);
    }

    public boolean isStillWaiting(UUID concertId, UUID userId) {
        QueueStatus status = internalStatus(concertId, userId).status();
        return status == QueueStatus.WAITING_ROOM || status == QueueStatus.WAITING;
    }

    private QueueStatusResponse waitingRoomStatus(UUID concertId, UUID userId) {
        if (Boolean.TRUE.equals(redisTemplate.hasKey(leftKey(concertId, userId)))) {
            return new QueueStatusResponse(
                    QueueStatus.LEFT, null, null, null, null, null, 0L, 0L, 0L);
        }
        Long rank = redisTemplate.opsForZSet().rank(waitingRoomKey(concertId), userId.toString());
        if (rank == null)
            rank =
                    redisTemplate
                            .opsForZSet()
                            .rank("queue:draw-source:" + concertId, userId.toString());
        if (rank == null) {
            return new QueueStatusResponse(
                    QueueStatus.EXPIRED, null, null, null, null, null, 0L, 0L, 0L);
        }
        return new QueueStatusResponse(
                QueueStatus.WAITING_ROOM,
                null,
                null,
                null,
                null,
                null,
                waitingRoomCount(concertId),
                0L,
                0L);
    }

    private ConcertView validateConcertForWaitingRoom(UUID concertId) {
        ConcertView concert = metadata.get(concertId);
        if (!"ON_SALE".equals(concert.status())) {
            throw new AppException(ErrorCode.CONCERT_NOT_ON_SALE, "error.concert-not-on-sale");
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (concert.saleStartAt() == null
                || concert.saleStartAt().minus(waitingRoomOpenBefore).isAfter(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "error.waiting-room.not-open");
        }
        if (concert.saleEndAt() != null && concert.saleEndAt().isBefore(now)) {
            throw new AppException(ErrorCode.SALE_NOT_OPEN, "error.waiting-room.sale-ended");
        }
        return concert;
    }

    private boolean isBeforeSaleStart(ConcertView concert) {
        return concert.saleStartAt().isAfter(OffsetDateTime.now());
    }

    private String openingPriority(ConcertView concert, UUID userId) {
        UUID concertId = concert.id();
        long seedTtl = Math.max(1, Duration.between(Instant.now(), concert.saleStartAt().toInstant())
                .plusDays(1).toMillis());
        String seed = adaptiveEnabled
                ? redisTemplate.execute(OPENING_SEED_SCRIPT,
                        List.of(drawStateKey(concertId), openingSeedKey(concertId), waitingRoomKey(concertId)),
                        UUID.randomUUID().toString(), Long.toString(seedTtl))
                : redisTemplate.opsForValue().get(openingSeedKey(concertId));
        if (seed == null || seed.isEmpty()) return "";
        try {
            Mac random = Mac.getInstance("HmacSHA256");
            random.init(new SecretKeySpec(seed.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Long.toString(ByteBuffer.wrap(random.doFinal(
                    userId.toString().getBytes(StandardCharsets.UTF_8))).getLong() >>> 12);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Cannot assign an opening priority", exception);
        }
    }

    private void ensureQueueDrawn(UUID concertId) {
        String stateKey = drawStateKey(concertId);
        if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return;
        String lockToken = UUID.randomUUID().toString();
        String lockKey = drawLockKey(concertId);
        Boolean acquired =
                redisTemplate.opsForValue().setIfAbsent(lockKey, lockToken, Duration.ofSeconds(30));
        if (!Boolean.TRUE.equals(acquired)) {
            throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.preparing");
        }
        String sourceKey = "queue:draw-source:" + concertId;
        String stagingKey = drawStagingPrefix(concertId) + lockToken;
        String seedKey = "queue:draw-seed:" + concertId;
        try {
            if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return;
            Long draw = redisTemplate.execute(
                    RedisScript.of(
                            """
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('get', KEYS[2]) == 'READY' then return 2 end
if redis.call('get', KEYS[2]) ~= 'DRAWING' then
    if redis.call('exists', KEYS[6]) == 1 then
        if redis.call('exists', KEYS[3]) == 1 then
            redis.call('rename', KEYS[3], KEYS[7])
        end
        redis.call('set', KEYS[8], ARGV[3])
        redis.call('set', KEYS[2], 'READY')
        redis.call('del', KEYS[6])
        return 2
    end
    if redis.call('exists', KEYS[3]) == 1 then redis.call('rename', KEYS[3], KEYS[4]) end
    redis.call('set', KEYS[2], 'DRAWING')
end
redis.call('set', KEYS[5], ARGV[2], 'NX')
return 1
""",
                            Long.class),
                    List.of(lockKey, stateKey, waitingRoomKey(concertId), sourceKey, seedKey,
                            openingSeedKey(concertId), queueKey(concertId), sequenceKey(concertId)),
                    lockToken,
                    Long.toString(UUID.randomUUID().getMostSignificantBits()),
                    Long.toString(LAST_OPENING_SCORE));
            if (Long.valueOf(2).equals(draw)) return;
            if (!Long.valueOf(1).equals(draw)) {
                throw new AppException(ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.preparing");
            }
            Set<String> entrants = redisTemplate.opsForZSet().range(sourceKey, 0, -1);
            List<String> randomized =
                    entrants == null ? new ArrayList<>() : new ArrayList<>(entrants);
            Collections.shuffle(
                    randomized,
                    new Random(Long.parseLong(redisTemplate.opsForValue().get(seedKey))));
            RedisScript<Long> writeBatch =
                    RedisScript.of(
                            """
                            if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
                            redis.call('pexpire', KEYS[1], 30000)
                            for i = 2, #ARGV, 2 do
                                if redis.call('zscore', KEYS[2], ARGV[i]) then
                                    redis.call('zadd', KEYS[3], ARGV[i+1], ARGV[i])
                                end
                            end
                            redis.call('pexpire', KEYS[3], 120000)
                            return 1
                            """,
                            Long.class);
            for (int start = 0; start < randomized.size(); start += 256) {
                List<String> args = new ArrayList<>();
                args.add(lockToken);
                for (int index = start; index < Math.min(start + 256, randomized.size()); index++) {
                    args.add(randomized.get(index));
                    args.add(Integer.toString(index + 1));
                }
                if (!Long.valueOf(1)
                        .equals(
                                redisTemplate.execute(
                                        writeBatch,
                                        List.of(lockKey, sourceKey, stagingKey),
                                        args.toArray()))) {
                    throw new AppException(
                            ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.cannot-complete");
                }
            }
            Long published =
                    redisTemplate.execute(
                            RedisScript.of(
                                    """
if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('del', KEYS[3])
if redis.call('exists', KEYS[2]) == 1 then
    redis.call('rename', KEYS[2], KEYS[3]); redis.call('persist', KEYS[3])
end
redis.call('set', KEYS[4], ARGV[2])
redis.call('set', KEYS[5], 'READY')
redis.call('del', KEYS[6])
return 1
""",
                                    Long.class),
                            List.of(
                                    lockKey,
                                    stagingKey,
                                    queueKey(concertId),
                                    sequenceKey(concertId),
                                    stateKey,
                                    sourceKey),
                            lockToken,
                            Integer.toString(randomized.size()));
            if (!Long.valueOf(1).equals(published))
                throw new AppException(
                        ErrorCode.REDIS_UNAVAILABLE, "error.waiting-room.cannot-complete");
        } finally {
            redisTemplate.execute(RELEASE_LOCK, List.of(lockKey), lockToken);
        }
    }

    private String drawStagingPrefix(UUID concertId) {
        return "queue:draw-staging:" + concertId + ":";
    }

    private void touchPresence(UUID concertId, UUID userId) {
        redisTemplate
                .opsForZSet()
                .add(
                        "queue:presence:" + concertId,
                        userId.toString(),
                        Instant.now().plus(presenceTtl).toEpochMilli());
    }

    private String adaptivePresenceMillis() {
        return adaptiveEnabled ? Long.toString(adaptivePresenceTtl.toMillis()) : "0";
    }

    private String presenceKey(UUID concertId) {
        return "queue:presence:" + concertId;
    }

    private void updatePresence(UUID concertId, UUID userId, QueueStatus status) {
        if (status == QueueStatus.WAITING || status == QueueStatus.WAITING_ROOM)
            touchPresence(concertId, userId);
        else redisTemplate.opsForZSet().remove("queue:presence:" + concertId, userId.toString());
    }

    private void cleanupDisconnectedUsers(UUID concertId) {
        String presence = presenceKey(concertId);
        var candidates = adaptiveEnabled
                ? redisTemplate.execute(EXPIRED_PRESENCE, List.of(presence))
                : redisTemplate.opsForZSet().rangeByScore(presence, 0, Instant.now().toEpochMilli(), 0, 64);
        if (candidates == null) return;
        for (Object candidate : candidates) {
            UUID userId = UUID.fromString(candidate.toString());
            if (removeExpiredUser(concertId, userId)) {
                eventPublisher.publishEvent(new com.ticketbox.shared.event.UserLeftQueueEvent(concertId, userId));
            }
        }
    }

    private boolean removeExpiredUser(UUID concertId, UUID userId) {
        // Recheck live membership, deadline, and session after reading candidates.
        return Long.valueOf(1).equals(redisTemplate.execute(
                REMOVE_EXPIRED,
                List.of(presenceKey(concertId), queueKey(concertId), waitingRoomKey(concertId),
                        "queue:draw-source:" + concertId, sessionKey(concertId, userId),
                        leftKey(concertId, userId), drawLockKey(concertId),
                        RedisAdmissionControl.concertPolicy(concertId)),
                userId.toString(), Long.toString(Instant.now().toEpochMilli()),
                Boolean.toString(adaptiveEnabled),
                Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()),
                drawStagingPrefix(concertId)));
    }

    private void consumeRateLimit(UUID userId, String action, RateLimitProperties.Policy policy) {
        String key = RedisKeyConstants.RATE_LIMIT_USER + userId + ":queue:" + action;
        if (!rateLimiter.tryConsume(key, policy)) {
            throw new AppException(
                    ErrorCode.RATE_LIMIT_EXCEEDED, "error.waiting-room.rate-limited");
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

    private String openingSeedKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_OPENING_SEED + concertId;
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
        Long count =
                redisTemplate
                        .opsForZSet()
                        .count(
                                activeKey(concertId),
                                Instant.now().toEpochMilli(),
                                Double.POSITIVE_INFINITY);
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
        return millis == null
                ? null
                : OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC);
    }

    private String blankToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value);
        return text.isBlank() ? null : text;
    }
}
