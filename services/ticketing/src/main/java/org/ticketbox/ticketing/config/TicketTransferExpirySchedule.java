package org.ticketbox.ticketing.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.issuance.application.TicketTransferService;

@Component
public class TicketTransferExpirySchedule {
    private final TicketTransferService transfers;

    public TicketTransferExpirySchedule(TicketTransferService transfers) {
        this.transfers = transfers;
    }

    @Scheduled(fixedDelayString = "${ticketbox.transfers.expiry-delay-ms:60000}")
    public void scheduled() {
        transfers.expireDue();
    }
}
