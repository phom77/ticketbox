package com.ticketbox.infrastructure.integration;

import com.ticketbox.module.concert.ConcertReminderView;
import com.ticketbox.shared.event.RemoteNotificationRequested;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Component @RequiredArgsConstructor
public class RemoteReminderDispatcher {
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    @Transactional
    public void dispatch(ConcertReminderView concert, UUID user) {
        UUID id=UUID.nameUUIDFromBytes(("reminder:"+concert.id()+":"+user).getBytes(StandardCharsets.UTF_8));
        if (jdbc.update("INSERT INTO remote_reminder_dispatches(event_id) VALUES(?) ON CONFLICT DO NOTHING",id)==0) return;
        events.publishEvent(new RemoteNotificationRequested(1,"concert.reminder-requested",id,concert.id(),user,
                OffsetDateTime.now(),id.toString(), Map.of("concertId",concert.id(),"concertTitle",concert.title(),
                "eventDate",concert.eventDate(),"venueName",concert.venueName(),"venueAddress",concert.venueAddress())));
    }
}
