package org.ticketbox.ticketing.reminder.application;

import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.application.port.ReminderDelivery;
import org.ticketbox.ticketing.application.port.catalog.ConcertReminderPort;
import org.ticketbox.ticketing.issuance.application.port.TicketReminderRecipientPort;

import java.time.OffsetDateTime;
import java.util.UUID;

@org.springframework.stereotype.Service
public class ReminderService {
    private final ConcertReminderPort concerts;
    private final TicketReminderRecipientPort recipients;
    private final ReminderDelivery dispatcher;

    public ReminderService(
            ConcertReminderPort concerts,
            TicketReminderRecipientPort recipients,
            ReminderDelivery dispatcher) {
        this.concerts = concerts;
        this.recipients = recipients;
        this.dispatcher = dispatcher;
    }

    public void scheduled() {
        var now = OffsetDateTime.now();
        for (var concert :
                concerts.findConcertsStartingBetween(now.plusHours(23), now.plusHours(25))) {
            dispatch(concert.id());
        }
    }

    public Object dispatch(UUID id) {
        var concert = concerts.findReminderConcertById(id).orElseThrow();
        var users = recipients.findDistinctUserIdsByConcertId(id);
        users.forEach(user -> dispatcher.dispatch(concert, user));
        return java.util.Map.of("recipients", users.size());
    }
}
