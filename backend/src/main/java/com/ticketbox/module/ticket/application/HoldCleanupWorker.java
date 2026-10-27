package com.ticketbox.module.ticket.application;

import com.ticketbox.module.ticket.domain.TicketHoldRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.UUID;

@Component @RequiredArgsConstructor @Slf4j
public class HoldCleanupWorker {
    private final TicketHoldRepository holds;
    private final ReservationService reservations;
    @Scheduled(fixedDelayString = "${ticketbox.holds.cleanup-interval-ms:10000}")
    public void cleanup() {
        for (Object[] owner : holds.expiredOwners()) {
            try { reservations.cleanupExpiredHoldsForOwner((UUID)owner[0],(UUID)owner[1]); }
            catch (RuntimeException exception) { log.warn("Hold cleanup will retry",exception); }
        }
    }
}
