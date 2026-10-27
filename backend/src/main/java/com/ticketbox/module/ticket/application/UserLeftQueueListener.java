package com.ticketbox.module.ticket.application;

import com.ticketbox.shared.event.UserLeftQueueEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class UserLeftQueueListener {
    private final ReservationService reservationService;

    @ApplicationModuleListener
    public void on(UserLeftQueueEvent event) {
        log.info("Received UserLeftQueueEvent for user {} and concert {}", event.userId(), event.concertId());
        reservationService.releaseHoldsForSession(event.userId(), event.concertId(), event.sessionToken());
    }
}
