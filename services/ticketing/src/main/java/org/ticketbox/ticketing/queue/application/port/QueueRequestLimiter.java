package org.ticketbox.ticketing.queue.application.port;

import java.util.UUID;

/** Limits how often one buyer can join or poll a queue. */
public interface QueueRequestLimiter {
    enum Action {
        JOIN,
        STATUS
    }

    boolean tryAcquire(UUID userId, Action action);
}
