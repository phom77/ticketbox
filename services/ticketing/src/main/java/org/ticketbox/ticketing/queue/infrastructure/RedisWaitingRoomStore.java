package org.ticketbox.ticketing.queue.infrastructure;

import lombok.RequiredArgsConstructor;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.infrastructure.redis.RedisKeyConstants;
import org.ticketbox.ticketing.queue.application.port.WaitingRoomStore;
import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * Redis implementation of the waiting room. The Lua scripts keep ordering, admission budgets,
 * presence and shopping sessions atomic across Ticketing workers. Keys and scripts are part of the
 * deployed state: change them only with a migration plan for queues that are already open.
 */
@Component
@RequiredArgsConstructor
public class RedisWaitingRoomStore implements WaitingRoomStore {

    private static final String SCHEDULED_CONCERTS = "queue:scheduled-concerts";
    private static final String SCHEDULER_LOCK = "queue:adaptive:scheduler";
    private static final String SCHEDULER_CURSOR = "queue:adaptive:cursor";
    private static final String GLOBAL_ACTIVE = "queue:global-active";

    private static final RedisScript<Long> REGISTER_CONCERT =
            RedisScript.of("return redis.call('zadd',KEYS[1],'NX',0,ARGV[1])", Long.class);

    private static final RedisScript<Long> POSTPONE_CONCERT = RedisScript.of("""
            if redis.call('zscore', KEYS[1], ARGV[1]) then
                local t = redis.call('time')
                local now = t[1] * 1000 + math.floor(t[2] / 1000)
                redis.call('zadd', KEYS[1], 'XX', now + 1000, ARGV[1])
            end
            return 1
            """, Long.class);

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

    @Override
    public void registerConcert(UUID concertId) {
        redisTemplate.execute(REGISTER_CONCERT, List.of(SCHEDULED_CONCERTS), concertId.toString());
    }

    @Override
    public Set<String> dueConcerts(long nowMillis, int limit) {
        Set<String> due =
                redisTemplate.opsForZSet().rangeByScore(SCHEDULED_CONCERTS, 0, nowMillis, 0, limit);
        return due == null ? Set.of() : due;
    }

    @Override
    public void unregisterConcert(String concert) {
        redisTemplate.opsForZSet().remove(SCHEDULED_CONCERTS, concert);
    }

    @Override
    public void postponeConcert(String concert) {
        redisTemplate.execute(POSTPONE_CONCERT, List.of(SCHEDULED_CONCERTS), concert);
    }

    @Override
    public boolean acquireSchedulerLease(String lease, Duration ttl) {
        return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(SCHEDULER_LOCK, lease, ttl));
    }

    @Override
    public void releaseSchedulerLease(String lease) {
        redisTemplate.execute(RELEASE_LOCK, List.of(SCHEDULER_LOCK), lease);
    }

    @Override
    public String schedulerCursor() {
        return redisTemplate.opsForValue().get(SCHEDULER_CURSOR);
    }

    @Override
    public void moveSchedulerCursor(String concert, Duration ttl) {
        redisTemplate.opsForValue().set(SCHEDULER_CURSOR, concert, ttl);
    }

    @Override
    public String openingSeed(UUID concertId, boolean create, long seedTtlMillis) {
        String seed = create
                ? redisTemplate.execute(OPENING_SEED_SCRIPT,
                        List.of(drawStateKey(concertId), openingSeedKey(concertId), waitingRoomKey(concertId)),
                        UUID.randomUUID().toString(), Long.toString(seedTtlMillis))
                : redisTemplate.opsForValue().get(openingSeedKey(concertId));
        return seed == null ? "" : seed;
    }

    @Override
    public WaitingRoomEntry enterWaitingRoom(
            UUID concertId, UUID userId, long presenceTtlMillis, String priority) {
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
                        userId.toString(), Long.toString(presenceTtlMillis), priority);
        return Long.valueOf(2).equals(joined) ? WaitingRoomEntry.DRAW_STARTED : WaitingRoomEntry.ENTERED;
    }

    @Override
    public void joinQueue(UUID concertId, UUID userId, long presenceTtlMillis) {
        redisTemplate.execute(
                JOIN_SCRIPT,
                List.of(
                        queueKey(concertId),
                        sequenceKey(concertId),
                        sessionKey(concertId, userId),
                        leftKey(concertId, userId),
                        presenceKey(concertId)),
                userId.toString(), Long.toString(presenceTtlMillis));
    }

    @Override
    public boolean queueReady(UUID concertId) {
        return "READY".equals(redisTemplate.opsForValue().get(drawStateKey(concertId)));
    }

    @Override
    public DrawResult drawQueue(UUID concertId) {
        String stateKey = drawStateKey(concertId);
        if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return DrawResult.READY;
        String lockToken = UUID.randomUUID().toString();
        String lockKey = drawLockKey(concertId);
        Boolean acquired =
                redisTemplate.opsForValue().setIfAbsent(lockKey, lockToken, Duration.ofSeconds(30));
        if (!Boolean.TRUE.equals(acquired)) {
            return DrawResult.PREPARING;
        }
        String sourceKey = "queue:draw-source:" + concertId;
        String stagingKey = drawStagingPrefix(concertId) + lockToken;
        String seedKey = "queue:draw-seed:" + concertId;
        try {
            if ("READY".equals(redisTemplate.opsForValue().get(stateKey))) return DrawResult.READY;
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
            if (Long.valueOf(2).equals(draw)) return DrawResult.READY;
            if (!Long.valueOf(1).equals(draw)) {
                return DrawResult.PREPARING;
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
                    return DrawResult.INCOMPLETE;
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
            if (!Long.valueOf(1).equals(published)) return DrawResult.INCOMPLETE;
            return DrawResult.READY;
        } finally {
            redisTemplate.execute(RELEASE_LOCK, List.of(lockKey), lockToken);
        }
    }

    @Override
    public Optional<StoredStatus> status(
            UUID concertId,
            UUID userId,
            long nowMillis,
            long presenceTtlMillis,
            int capacity,
            long estimatedServiceSeconds) {
        List<?> raw =
                redisTemplate.execute(
                        STATUS_SCRIPT,
                        List.of(
                                queueKey(concertId),
                                activeKey(concertId),
                                sessionKey(concertId, userId),
                                leftKey(concertId, userId),
                                presenceKey(concertId), waitingRoomKey(concertId),
                                drawSourceKey(concertId), drawStateKey(concertId),
                                RedisAdmissionControl.concertPolicy(concertId), RedisAdmissionControl.SHARED_POLICY),
                        userId.toString(),
                        Long.toString(nowMillis),
                        Long.toString(presenceTtlMillis),
                        Integer.toString(capacity),
                        Long.toString(estimatedServiceSeconds));
        if (raw == null || raw.isEmpty()) return Optional.empty();
        boolean counted = raw.size() > 8;
        return Optional.of(new StoredStatus(
                QueueStatus.valueOf(String.valueOf(raw.get(0))),
                parseInteger(raw.get(1)),
                parseInteger(raw.get(2)),
                parseLong(raw.get(3)),
                blankToNull(raw.get(4)),
                parseExpiresAt(raw.get(5)),
                counted ? parseLong(raw.get(6)) : null,
                counted ? parseLong(raw.get(7)) : null,
                counted ? parseLong(raw.get(8)) : null));
    }

    @Override
    public boolean hasLeft(UUID concertId, UUID userId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(leftKey(concertId, userId)));
    }

    @Override
    public Optional<Long> waitingRoomRank(UUID concertId, UUID userId) {
        Long rank = redisTemplate.opsForZSet().rank(waitingRoomKey(concertId), userId.toString());
        if (rank == null) rank = redisTemplate.opsForZSet().rank(drawSourceKey(concertId), userId.toString());
        return Optional.ofNullable(rank);
    }

    @Override
    public String leave(UUID concertId, UUID userId) {
        return redisTemplate.execute(
                LEAVE_SCRIPT,
                List.of(
                        queueKey(concertId),
                        activeKey(concertId),
                        sessionKey(concertId, userId),
                        leftKey(concertId, userId),
                        GLOBAL_ACTIVE,
                        waitingRoomKey(concertId),
                        drawSourceKey(concertId),
                        presenceKey(concertId),
                        drawLockKey(concertId),
                        RedisAdmissionControl.concertPolicy(concertId)),
                userId.toString(),
                Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()),
                concertId + ":" + userId,
                drawStagingPrefix(concertId));
    }

    @Override
    public List<UUID> queueHead(UUID concertId, int limit) {
        Set<String> candidates = redisTemplate.opsForZSet().range(queueKey(concertId), 0, limit - 1);
        return candidates == null ? List.of() : candidates.stream().map(UUID::fromString).toList();
    }

    @Override
    public AdmissionGrant admit(
            UUID concertId, UUID userId, String sessionToken, AdmissionBudget budget) {
        String candidate = userId.toString();
        Long granted =
                redisTemplate.execute(
                        ADMIT_SCRIPT,
                        List.of(
                                queueKey(concertId),
                                activeKey(concertId),
                                sessionKey(concertId, userId),
                                GLOBAL_ACTIVE,
                                "queue:admission-budget:" + concertId,
                                "queue:global-admission-budget",
                                presenceKey(concertId),
                                leftKey(concertId, userId),
                                RedisAdmissionControl.concertPolicy(concertId),
                                RedisAdmissionControl.SHARED_POLICY),
                        candidate,
                        concertId + ":" + candidate,
                        sessionToken,
                        Long.toString(budget.sessionTtl().toMillis()),
                        Integer.toString(budget.capacity()),
                        Integer.toString(budget.globalCapacity()),
                        Integer.toString(budget.rate()),
                        Integer.toString(budget.burst()),
                        Integer.toString(budget.globalRate()),
                        Integer.toString(budget.globalBurst()), Boolean.toString(budget.adaptive()),
                        Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()));
        if (Long.valueOf(1).equals(granted)) return AdmissionGrant.GRANTED;
        return Long.valueOf(-1).equals(granted) ? AdmissionGrant.SKIPPED_EXPIRED : AdmissionGrant.STOPPED;
    }

    @Override
    public String sessionToken(UUID concertId, UUID userId) {
        return redisTemplate.opsForValue().get(sessionKey(concertId, userId));
    }

    @Override
    public void finishShoppingSession(UUID concertId, UUID userId, String expectedToken) {
        redisTemplate.execute(
                FINISH_SESSION_SCRIPT,
                List.of(
                        queueKey(concertId),
                        activeKey(concertId),
                        sessionKey(concertId, userId),
                        GLOBAL_ACTIVE,
                        presenceKey(concertId),
                        RedisAdmissionControl.concertPolicy(concertId)),
                userId.toString(),
                concertId + ":" + userId,
                expectedToken);
    }

    @Override
    public void touchPresence(UUID concertId, UUID userId, long deadlineMillis) {
        redisTemplate.opsForZSet().add(presenceKey(concertId), userId.toString(), deadlineMillis);
    }

    @Override
    public void removePresence(UUID concertId, UUID userId) {
        redisTemplate.opsForZSet().remove(presenceKey(concertId), userId.toString());
    }

    @Override
    public Collection<?> expiredPresence(UUID concertId, boolean useStoreClock, long nowMillis) {
        String presence = presenceKey(concertId);
        Collection<?> candidates = useStoreClock
                ? redisTemplate.execute(EXPIRED_PRESENCE, List.of(presence))
                : redisTemplate.opsForZSet().rangeByScore(presence, 0, nowMillis, 0, 64);
        return candidates == null ? List.of() : candidates;
    }

    @Override
    public boolean removeExpired(UUID concertId, UUID userId, long nowMillis, boolean useStoreClock) {
        return Long.valueOf(1).equals(redisTemplate.execute(
                REMOVE_EXPIRED,
                List.of(presenceKey(concertId), queueKey(concertId), waitingRoomKey(concertId),
                        drawSourceKey(concertId), sessionKey(concertId, userId),
                        leftKey(concertId, userId), drawLockKey(concertId),
                        RedisAdmissionControl.concertPolicy(concertId)),
                userId.toString(), Long.toString(nowMillis),
                Boolean.toString(useStoreClock),
                Long.toString(RedisKeyConstants.TTL_QUEUE_LEFT_MARKER.toMillis()),
                drawStagingPrefix(concertId)));
    }

    @Override
    public long waitingRoomSize(UUID concertId) {
        return zCard(waitingRoomKey(concertId));
    }

    @Override
    public long queueSize(UUID concertId) {
        return zCard(queueKey(concertId));
    }

    @Override
    public long activeShoppers(UUID concertId, long nowMillis) {
        Long count = redisTemplate.opsForZSet().count(activeKey(concertId), nowMillis, Double.POSITIVE_INFINITY);
        return count == null ? 0 : count;
    }

    static String queueKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_CONCERT + concertId;
    }

    static String presenceKey(UUID concertId) {
        return "queue:presence:" + concertId;
    }

    private static String drawSourceKey(UUID concertId) {
        return "queue:draw-source:" + concertId;
    }

    private static String drawStagingPrefix(UUID concertId) {
        return "queue:draw-staging:" + concertId + ":";
    }

    private static String sequenceKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_SEQUENCE + concertId;
    }

    private static String waitingRoomKey(UUID concertId) {
        return RedisKeyConstants.WAITING_ROOM_CONCERT + concertId;
    }

    private static String waitingRoomSequenceKey(UUID concertId) {
        return RedisKeyConstants.WAITING_ROOM_SEQUENCE + concertId;
    }

    private static String drawStateKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_DRAW_STATE + concertId;
    }

    private static String drawLockKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_DRAW_LOCK + concertId;
    }

    private static String openingSeedKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_OPENING_SEED + concertId;
    }

    private static String activeKey(UUID concertId) {
        return RedisKeyConstants.QUEUE_ACTIVE + concertId;
    }

    private static String sessionKey(UUID concertId, UUID userId) {
        return RedisKeyConstants.QUEUE_SESSION + concertId + ":" + userId;
    }

    private static String leftKey(UUID concertId, UUID userId) {
        return RedisKeyConstants.QUEUE_LEFT + concertId + ":" + userId;
    }

    private long zCard(String key) {
        Long value = redisTemplate.opsForZSet().zCard(key);
        return value == null ? 0L : value;
    }

    private static Integer parseInteger(Object value) {
        String text = blankToNull(value);
        return text == null ? null : Integer.valueOf(text);
    }

    private static Long parseLong(Object value) {
        String text = blankToNull(value);
        return text == null ? null : Long.valueOf(text);
    }

    private static OffsetDateTime parseExpiresAt(Object value) {
        Long millis = parseLong(value);
        return millis == null
                ? null
                : OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC);
    }

    private static String blankToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value);
        return text.isBlank() ? null : text;
    }
}
