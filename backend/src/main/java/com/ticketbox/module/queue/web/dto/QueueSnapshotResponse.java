package com.ticketbox.module.queue.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Public counters only; admission tokens are sent on the private user destination. */
public record QueueSnapshotResponse(UUID concertId, long waitingRoomCount, long queueSize,
                                    long activeShoppers, OffsetDateTime updatedAt) {}
