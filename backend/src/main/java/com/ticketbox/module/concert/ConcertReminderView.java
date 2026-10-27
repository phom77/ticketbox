package com.ticketbox.module.concert;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Read model for concert reminder data exposed by the {@code concert} module.
 * Contains only the fields needed to compose a reminder notification.
 */
public record ConcertReminderView(
        UUID id,
        String title,
        String venueName,
        String venueAddress,
        OffsetDateTime eventDate
) {}
