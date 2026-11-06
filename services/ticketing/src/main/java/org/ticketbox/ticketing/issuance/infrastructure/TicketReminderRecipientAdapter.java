package org.ticketbox.ticketing.issuance.infrastructure;

import org.ticketbox.ticketing.issuance.TicketReminderRecipientPort;
import org.ticketbox.ticketing.issuance.domain.TicketRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

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
