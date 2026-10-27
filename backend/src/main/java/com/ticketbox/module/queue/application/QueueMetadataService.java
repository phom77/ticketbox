package com.ticketbox.module.queue.application;

import com.ticketbox.infrastructure.redis.RedisReadCache;
import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.UUID;

@Service
public class QueueMetadataService {
    private final ConcertOrderPort concerts;
    private final RedisReadCache cache;
    public QueueMetadataService(ConcertOrderPort concerts, RedisReadCache cache) {
        this.concerts = concerts;
        this.cache = cache;
    }
    public ConcertView get(UUID concertId) {
        return cache.get("queue_metadata", "cache:queue:metadata:" + concertId,
                ConcertView.class, Duration.ofSeconds(5), () -> concerts.findConcertById(concertId)
                        .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert")));
    }
}
