package com.ticketbox.module.ticket.infrastructure;

import com.ticketbox.module.ticket.TicketReminderRecipientPort;
import com.ticketbox.module.ticket.domain.TicketRepository;
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
