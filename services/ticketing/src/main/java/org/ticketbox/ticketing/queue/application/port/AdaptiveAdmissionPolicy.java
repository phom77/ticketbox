package org.ticketbox.ticketing.queue.application.port;

import java.util.UUID;

/** Adjusts adaptive admission rates from completed health windows. */
public interface AdaptiveAdmissionPolicy {
    long completedWindow();

    void refreshShared(long window);

    void refreshConcert(UUID concertId, long window);
}
