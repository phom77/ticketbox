package org.ticketbox.ticketing.issuance.infrastructure;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.issuance.application.port.TicketReminderRecipientPort;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class TicketReminderRecipientAdapter implements TicketReminderRecipientPort {

    private final TicketRepository ticketRepository;

    @Override
    public List<UUID> findDistinctUserIdsByConcertId(UUID concertId) {
        return ticketRepository.findDistinctUserIdsByConcertId(concertId);
    }
}
