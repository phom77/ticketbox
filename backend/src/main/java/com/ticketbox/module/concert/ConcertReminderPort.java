package com.ticketbox.module.concert;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Public port exposed by the {@code concert} module.
 *
 * <p>Consumed by the {@code notification} module to find upcoming concerts
 * that require 24-hour reminder notifications.
 */
public interface ConcertReminderPort {

    /**
     * Returns concerts whose {@code eventDate} falls within the given window
     * and whose status allows ticket-holders to attend (i.e. {@code ON_SALE} or {@code SOLD_OUT}).
     *
     * @param from start of the search window (inclusive)
     * @param to   end of the search window (inclusive)
     * @return list of upcoming concerts in that window
     */
    List<ConcertReminderView> findConcertsStartingBetween(OffsetDateTime from, OffsetDateTime to);

    Optional<ConcertReminderView> findReminderConcertById(UUID concertId);
}
