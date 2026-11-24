package org.ticketbox.ticketing.queue.infrastructure;

import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.config.RateLimitProperties;
import org.ticketbox.ticketing.queue.application.port.AdaptiveAdmissionPolicy;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth;
import org.ticketbox.ticketing.queue.application.port.DispatchBacklog;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy.Health;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy.Sample;
import org.ticketbox.ticketing.queue.domain.AdmissionPolicy.State;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@Slf4j
public class RedisAdmissionControl implements AdmissionHealth, AdaptiveAdmissionPolicy {
    private static final String PREFIX = "queue:adaptive:";
    static final String SHARED_POLICY = PREFIX + "policy:shared";
    private static final RedisScript<Long> COMPLETED_WINDOW = RedisScript.of(
            "return math.floor(tonumber(redis.call('time')[1]) / 15) - 1", Long.class);
    private static final RedisScript<Long> RECORD = RedisScript.of("""
            local window = math.floor(tonumber(redis.call('time')[1]) / 15)
            for _, prefix in ipairs(KEYS) do
                local key = prefix .. ':' .. window
                redis.call('hincrby', key, ARGV[1] .. ':total', 1)
                redis.call('hincrby', key, ARGV[1] .. ':slow', ARGV[2])
                redis.call('hincrby', key, ARGV[1] .. ':failures', ARGV[3])
                if ARGV[4] == '1' then redis.call('hset', key, ARGV[1] .. ':unavailable', '1') end
                redis.call('expire', key, 90)
            end
            return 1
            """, Long.class);

    // The version compares all fields used in the decision, including peak changes
    // within the same interval. The queue count and reset use live Redis membership.
    private static final RedisScript<Long> SAVE = RedisScript.of("""
            local version = redis.call('hget', KEYS[1], 'version') or '0'
            if version ~= ARGV[1] then return 0 end
            if #KEYS == 3 then
                local clock = redis.call('time')
                local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
                local count = redis.call('zcard', KEYS[2]) - redis.call('zcount', KEYS[3], '-inf', now)
                if math.max(0, count) ~= tonumber(ARGV[7]) then return 0 end
            end
            redis.call('hset', KEYS[1], 'window', ARGV[2], 'peak', ARGV[3], 'rate', ARGV[4],
                'healthy', ARGV[5], 'capacity', ARGV[6], 'version', ARGV[8])
            redis.call('expire', KEYS[1], 1800)
            return 1
            """, Long.class);

    private static final RedisScript<Long> LIVE_WAITING = RedisScript.of("""
            local clock = redis.call('time')
            local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
            return math.max(0, redis.call('zcard', KEYS[1]) - redis.call('zcount', KEYS[2], '-inf', now))
            """, Long.class);

    private final StringRedisTemplate redis;
    private final boolean enabled;
    private final int sharedLimit;
    private final List<DispatchBacklog> dispatchBacklogs;

    public RedisAdmissionControl(
            StringRedisTemplate redis, RateLimitProperties limits, List<DispatchBacklog> dispatchBacklogs,
            @Value("${ticketbox.queue.adaptive-enabled:false}") boolean enabled) {
        this.redis = redis;
        this.enabled = enabled;
        this.dispatchBacklogs = dispatchBacklogs;
        this.sharedLimit = AdmissionPolicy.sharedLimit(
                requestsPerSecond(limits.globalPurchase()), requestsPerSecond(limits.globalPayment()));
        if (enabled && sharedLimit < 1) {
            throw new IllegalArgumentException("Adaptive admission requires positive shared purchase and payment headroom");
        }
    }

    @Override
    public boolean enabled() {
        return enabled;
    }

    @Override
    public void record(UUID concert, Path path, boolean slow, boolean failure, boolean unavailable) {
        if (!enabled) return;
        List<String> keys = concert == null
                ? List.of(healthKey("shared"))
                : List.of(healthKey("shared"), healthKey(concert.toString()));
        try {
            redis.execute(RECORD, keys, path.name(), bit(slow), bit(failure), bit(unavailable));
        } catch (RuntimeException ex) {
            log.debug("Unable to record admission health", ex);
        }
    }

    @Override
    public long completedWindow() {
        return redis.execute(COMPLETED_WINDOW, List.of());
    }

    @Override
    public void refreshConcert(UUID concert, long window) {
        refreshConcert(concert, RedisWaitingRoomStore.queueKey(concert),
                RedisWaitingRoomStore.presenceKey(concert), window);
    }

    void refreshConcert(UUID concert, String queueKey, String presenceKey, long window) {
        String key = concertPolicy(concert);
        List<String> membership = List.of(queueKey, presenceKey);
        List<String> keys = List.of(key, queueKey, presenceKey);
        for (int attempt = 0; attempt < 3; attempt++) {
            var old = redis.opsForHash().entries(key);
            long previousWindow = field(old, "window", window);
            if (previousWindow > window) return;
            long waiting = redis.execute(LIVE_WAITING, membership);
            State before = state(old, AdmissionPolicy.initial(waiting));
            State next = before.withWaiting(waiting);
            if (previousWindow < window && before.peak() > 0 && waiting > 0) {
                next = advance(next, previousWindow, window, purchaseHealth(concert.toString(), window),
                        AdmissionPolicy.target(next.peak()));
            }
            if (previousWindow == window && next.equals(before) && !old.isEmpty()) return;
            if (save(keys, old, next, window, waiting)) return;
        }
    }

    @Override
    public void refreshShared(long window) {
        var old = redis.opsForHash().entries(SHARED_POLICY);
        long previousWindow = field(old, "window", window - 1);
        if (previousWindow >= window) return;
        // Only one worker samples PostgreSQL for each window. If it disappears,
        // the next interval can claim a fresh sample.
        if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(
                PREFIX + "dispatch-sample:" + window, "1", Duration.ofSeconds(90)))) return;
        State before = state(old, new State(0, sharedLimit, 0));
        Health purchase = purchaseHealth("shared", window);
        Sample payment = sample("shared", window, Path.PAYMENT);
        Health health = dispatchOverdue() || purchase == Health.OVERLOADED
                || AdmissionPolicy.health(payment, Sample.EMPTY) == Health.OVERLOADED
                ? Health.OVERLOADED : purchase;
        save(List.of(SHARED_POLICY), old, advance(before, previousWindow, window, health, sharedLimit),
                window, 0);
    }

    private boolean dispatchOverdue() {
        try {
            return dispatchBacklogs.stream().anyMatch(DispatchBacklog::overdue);
        } catch (RuntimeException unavailable) {
            log.warn("Could not read the payment dispatch backlog", unavailable);
            return true;
        }
    }

    static String concertPolicy(UUID concert) {
        return PREFIX + "policy:" + concert;
    }

    private State advance(State state, long previousWindow, long window, Health health, int target) {
        // Missing windows break a healthy streak.
        if (previousWindow + 1 != window) state = new State(state.peak(), state.rate(), 0);
        return state.advance(health, target);
    }

    private Health purchaseHealth(String scope, long window) {
        return AdmissionPolicy.health(sample(scope, window, Path.RESERVE),
                sample(scope, window, Path.CHECKOUT));
    }

    private Sample sample(String scope, long window, Path path) {
        var counters = redis.opsForHash().multiGet(healthKey(scope) + ":" + window,
                List.of(path + ":total", path + ":slow", path + ":failures", path + ":unavailable"));
        return new Sample(number(counters.get(0)), number(counters.get(1)), number(counters.get(2)),
                "1".equals(counters.get(3)));
    }

    private boolean save(List<String> keys, Map<Object, Object> old, State state, long window, long waiting) {
        return Long.valueOf(1).equals(redis.execute(SAVE, keys,
                old.getOrDefault("version", "0").toString(), Long.toString(window),
                Long.toString(state.peak()), Integer.toString(state.rate()),
                Integer.toString(state.healthyWindows()), Integer.toString(AdmissionPolicy.capacity(state.rate())),
                Long.toString(waiting), UUID.randomUUID().toString()));
    }

    private State state(Map<Object, Object> fields, State fallback) {
        return new State(field(fields, "peak", fallback.peak()),
                (int) field(fields, "rate", fallback.rate()),
                (int) field(fields, "healthy", fallback.healthyWindows()));
    }

    private long field(Map<Object, Object> fields, String key, long fallback) {
        return fields.containsKey(key) ? number(fields.get(key)) : fallback;
    }

    private long number(Object raw) {
        return raw == null ? 0 : Long.parseLong(raw.toString());
    }

    private static String bit(boolean value) {
        return value ? "1" : "0";
    }

    private static String healthKey(String scope) {
        return PREFIX + "health:" + scope;
    }

    private static double requestsPerSecond(RateLimitProperties.Policy policy) {
        return policy.refillTokens() * 1000.0 / policy.refillPeriod().toMillis();
    }
}
