package org.ticketbox.ticketing.integration.notification;

import org.ticketbox.ticketing.integration.catalog.ConcertReminderPort;
import org.ticketbox.ticketing.issuance.TicketReminderRecipientPort;
import org.ticketbox.ticketing.web.ApiResponse;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
public class Reminders {
    private final ConcertReminderPort concerts;
    private final TicketReminderRecipientPort recipients;
    private final RemoteReminderDispatcher dispatcher;

    public Reminders(ConcertReminderPort concerts,TicketReminderRecipientPort recipients,RemoteReminderDispatcher dispatcher) {
        this.concerts=concerts; this.recipients=recipients; this.dispatcher=dispatcher;
    }

    @Scheduled(fixedDelayString="${ticketbox.notifications.reminder.fixed-delay-ms:300000}")
    public void scheduled() {
        var now=OffsetDateTime.now();
        for (var concert : concerts.findConcertsStartingBetween(now.plusHours(23),now.plusHours(25))) {
            dispatch(concert.id());
        }
    }

    @PostMapping("/api/admin/concerts/{id}/reminders/send")
    public Object dispatch(@PathVariable UUID id) {
        var concert=concerts.findReminderConcertById(id).orElseThrow();
        var users=recipients.findDistinctUserIdsByConcertId(id);
        users.forEach(user->dispatcher.dispatch(concert,user));
        return ApiResponse.success(java.util.Map.of("recipients",users.size()));
    }
}
