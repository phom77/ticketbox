package org.ticketbox.ticketing.application.port;

import org.ticketbox.ticketing.application.port.catalog.ConcertReminderView;

import java.util.UUID;

public interface ReminderDelivery {
    void dispatch(ConcertReminderView concert, UUID userId);
}
