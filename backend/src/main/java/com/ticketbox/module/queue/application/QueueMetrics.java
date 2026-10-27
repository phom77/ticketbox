package com.ticketbox.module.queue.application;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.concurrent.atomic.AtomicLong;

/** Aggregate gauges avoid retaining a metric time series for every user or concert. */
@Component
public class QueueMetrics {
    private final StringRedisTemplate redis;
    private final MeterRegistry metrics;
    private final AtomicLong waiting = new AtomicLong();
    private final AtomicLong active = new AtomicLong();
    public QueueMetrics(StringRedisTemplate redis, MeterRegistry metrics) {
        this.redis = redis;
        this.metrics = metrics;
        metrics.gauge("ticketbox.queue.waiting", waiting);
        metrics.gauge("ticketbox.queue.active", active);
    }
    @Scheduled(fixedDelay = 5000)
    public void sample() {
        try {
            var concerts = redis.opsForZSet().range("queue:scheduled-concerts", 0, -1);
            long waitingTotal = 0, activeTotal = 0;
            if (concerts != null) for (String concert : concerts) {
                Long queue = redis.opsForZSet().size("queue:concert:" + concert);
                Long room = redis.opsForZSet().size("waiting-room:concert:" + concert);
                Long shoppers = redis.opsForZSet().size("queue:active:" + concert);
                waitingTotal += (queue == null ? 0 : queue) + (room == null ? 0 : room);
                activeTotal += shoppers == null ? 0 : shoppers;
            }
            waiting.set(waitingTotal); active.set(activeTotal);
        } catch (RuntimeException exception) {
            metrics.counter("ticketbox.queue.metrics.errors").increment();
        }
    }
}
