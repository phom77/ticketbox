package com.ticketbox.module.concert.infrastructure;

import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.module.concert.ConcertReportingView;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.domain.TicketTypeRepository;
import com.ticketbox.module.concert.TicketTypeReportingView;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ConcertReportingAdapter implements ConcertReportingPort {

    private final ConcertRepository concertRepository;
    private final TicketTypeRepository ticketTypeRepository;

    @Override
    public Optional<ConcertReportingView> findOwnedConcert(UUID concertId, UUID organizerId) {
        return concertRepository.findByIdAndCreatedBy(concertId, organizerId)
                .map(this::toConcertView);
    }

    @Override
    public Optional<ConcertReportingView> findConcert(UUID concertId) {
        return concertRepository.findById(concertId).map(this::toConcertView);
    }

    @Override
    public List<UUID> findConcertIdsOwnedBy(UUID organizerId) {
        return concertRepository.findByCreatedBy(organizerId).stream()
                .map(Concert::getId)
                .toList();
    }

    @Override
    public Page<ConcertReportingView> findCompletedConcerts(
            UUID organizerId,
            Pageable pageable) {
        return concertRepository.findByCreatedByAndStatus(
                        organizerId,
                        Concert.Status.COMPLETED,
                        pageable)
                .map(this::toConcertView);
    }

    @Override
    public List<TicketTypeReportingView> findTicketTypes(UUID concertId) {
        return ticketTypeRepository.findByConcertId(concertId).stream()
                .map(ticketType -> new TicketTypeReportingView(
                        ticketType.getId(),
                        ticketType.getName(),
                        ticketType.getPrice(),
                        ticketType.getTotalQuantity()))
                .toList();
    }

    private ConcertReportingView toConcertView(Concert concert) {
        return new ConcertReportingView(
                concert.getId(),
                concert.getTitle(),
                concert.getEventDate(),
                concert.getStatus().name());
    }
}
