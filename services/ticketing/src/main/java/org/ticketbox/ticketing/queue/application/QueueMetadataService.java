package org.ticketbox.ticketing.queue.application;

import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.ReadCache;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;

import java.time.Duration;
import java.util.UUID;

@Service
public class QueueMetadataService {
    private final ConcertOrderPort concerts;
    private final ReadCache cache;

    public QueueMetadataService(ConcertOrderPort concerts, ReadCache cache) {
        this.concerts = concerts;
        this.cache = cache;
    }

    public ConcertView get(UUID concertId) {
        return cache.get(
                "queue_metadata",
                "cache:queue:metadata:" + concertId,
                ConcertView.class,
                Duration.ofSeconds(5),
                () ->
                        concerts.findConcertById(concertId)
                                .orElseThrow(
                                        () ->
                                                new AppException(
                                                        ErrorCode.CONCERT_NOT_FOUND,
                                                        "Không tìm thấy concert")));
    }
}
