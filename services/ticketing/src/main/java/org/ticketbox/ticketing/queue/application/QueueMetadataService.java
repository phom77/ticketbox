package org.ticketbox.ticketing.queue.application;

import org.ticketbox.ticketing.redis.RedisReadCache;
import org.ticketbox.ticketing.integration.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.integration.catalog.ConcertView;
import org.ticketbox.ticketing.web.AppException;
import org.ticketbox.ticketing.web.ErrorCode;
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
