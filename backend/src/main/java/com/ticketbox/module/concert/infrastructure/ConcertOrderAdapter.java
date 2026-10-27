package com.ticketbox.module.concert.infrastructure;

import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.module.concert.TicketTypeView;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.domain.TicketTypeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ConcertOrderAdapter implements ConcertOrderPort {
    private final ConcertRepository concertRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final com.ticketbox.module.inventory.InventoryPort inventory;

    @Override
    public Optional<ConcertView> findConcertById(UUID concertId) {
        return concertRepository.findById(concertId)
                .map(c -> new ConcertView(
                        c.getId(),
                        c.getTitle(),
                        c.getStatus().name(),
                        c.getEventDate(),
                        c.getSaleStartAt(),
                        c.getSaleEndAt()
                ));
    }

    @Override
    public List<ConcertView> findConcertsByIds(Collection<UUID> concertIds) {
        return concertRepository.findAllById(concertIds).stream()
                .map(c -> new ConcertView(
                        c.getId(),
                        c.getTitle(),
                        c.getStatus().name(),
                        c.getEventDate(),
                        c.getSaleStartAt(),
                        c.getSaleEndAt()
                ))
                .toList();
    }

    @Override
    public List<UUID> findConcertIdsOwnedBy(UUID organizerId) {
        return concertRepository.findByCreatedBy(organizerId).stream()
                .map(concert -> concert.getId())
                .toList();
    }

    @Override
    public boolean isConcertOwnedBy(UUID concertId, UUID organizerId) {
        return concertRepository.findByIdAndCreatedBy(concertId, organizerId).isPresent();
    }

    @Override
    public List<TicketTypeView> findTicketTypesByIds(Collection<UUID> ticketTypeIds) {
        return ticketTypeRepository.findAllById(ticketTypeIds).stream()
                .map(t -> new TicketTypeView(
                        t.getId(),
                        t.getConcertId(),
                        t.getName(),
                        t.getPrice(),
                        t.getTotalQuantity(),
                        inventory.available(t.getId()),
                        t.getMaxPerAccount(),
                        t.isActive()
                ))
                .toList();
    }

}
