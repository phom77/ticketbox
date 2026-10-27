package com.ticketbox.shared.util;

import java.time.Duration;

public class RedisKeyConstants {
    private RedisKeyConstants() {}

    public static final String CACHE_CONCERT_LIST = "cache:concert:list";
    public static final String CACHE_CONCERT_DETAIL = "cache:concert:";
    public static final String CACHE_AVAILABILITY = "cache:availability:";
    public static final String IDEMPOTENCY_ORDER = "idempotency:order:";
    public static final String RATE_LIMIT_USER = "rate-limit:user:";
    public static final String RATE_LIMIT_IP = "rate-limit:ip:";
    public static final String QUEUE_CONCERT = "queue:concert:";
    public static final String QUEUE_SEQUENCE = "queue:sequence:";
    public static final String WAITING_ROOM_CONCERT = "waiting-room:concert:";
    public static final String WAITING_ROOM_SEQUENCE = "waiting-room:sequence:";
    public static final String QUEUE_DRAW_STATE = "queue:draw-state:";
    public static final String QUEUE_DRAW_LOCK = "queue:draw-lock:";
    public static final String QUEUE_ACTIVE = "queue:active:";
    public static final String QUEUE_SESSION = "shopping-session:";
    public static final String QUEUE_LEFT = "queue:left:";

    public static final Duration TTL_CONCERT_LIST = Duration.ofSeconds(30);
    public static final Duration TTL_CONCERT_DETAIL = Duration.ofSeconds(60);
    public static final Duration TTL_AVAILABILITY = Duration.ofSeconds(2);
    public static final Duration TTL_IDEMPOTENCY = Duration.ofHours(24);
    public static final Duration TTL_IDEMPOTENCY_PROCESSING = Duration.ofMinutes(2);
    public static final Duration TTL_QUEUE_SESSION = Duration.ofMinutes(10);
    public static final Duration TTL_QUEUE_LEFT_MARKER = Duration.ofMinutes(10);
}
