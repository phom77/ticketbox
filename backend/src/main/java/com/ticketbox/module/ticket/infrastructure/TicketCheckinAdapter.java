package com.ticketbox.module.ticket.infrastructure;

import com.ticketbox.module.ticket.domain.Ticket;
import com.ticketbox.module.ticket.TicketCheckinPort;
import com.ticketbox.module.ticket.TicketCheckinStats;
import com.ticketbox.module.ticket.domain.TicketRepository;
import com.ticketbox.module.ticket.TicketView;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class TicketCheckinAdapter implements TicketCheckinPort {
    private final TicketRepository ticketRepository;

    @Override
    public Optional<TicketView> findByQrCode(String qrCode) {
        return ticketRepository.findByQrCode(qrCode)
                .map(this::toView);
    }

    @Override
    public List<TicketView> findByConcertIdAndStatusValid(UUID concertId) {
        return ticketRepository.findByConcertIdAndStatus(concertId, Ticket.Status.VALID)
                .stream()
                .map(this::toView)
                .toList();
    }

    @Override
    public Page<TicketView> findByConcertId(
            UUID concertId,
            String query,
            String status,
            Pageable pageable
    ) {
        String normalizedQuery = query == null ? "" : query.trim();
        Ticket.Status ticketStatus = status == null || status.isBlank()
                ? null
                : Ticket.Status.valueOf(status);

        Page<Ticket> tickets;
        if (ticketStatus != null && !normalizedQuery.isEmpty()) {
            tickets = ticketRepository.findByConcertIdAndStatusAndQrCodeContainingIgnoreCase(
                    concertId,
                    ticketStatus,
                    normalizedQuery,
                    pageable
            );
        } else if (ticketStatus != null) {
            tickets = ticketRepository.findByConcertIdAndStatus(concertId, ticketStatus, pageable);
        } else if (!normalizedQuery.isEmpty()) {
            tickets = ticketRepository.findByConcertIdAndQrCodeContainingIgnoreCase(
                    concertId,
                    normalizedQuery,
                    pageable
            );
        } else {
            tickets = ticketRepository.findByConcertId(concertId, pageable);
        }

        return tickets.map(this::toView);
    }

    @Override
    public Map<UUID, TicketView> findByIds(List<UUID> ticketIds) {
        return ticketRepository.findAllById(ticketIds).stream()
                .map(this::toView)
                .collect(Collectors.toMap(TicketView::id, Function.identity()));
    }

    @Override
    public TicketCheckinStats getStats(UUID concertId) {
        return new TicketCheckinStats(
                ticketRepository.countByConcertId(concertId),
                ticketRepository.countByConcertIdAndStatus(concertId, Ticket.Status.VALID),
                ticketRepository.countByConcertIdAndStatus(concertId, Ticket.Status.USED),
                ticketRepository.countByConcertIdAndStatus(concertId, Ticket.Status.CANCELLED),
                ticketRepository.countByConcertIdAndStatus(concertId, Ticket.Status.TRANSFERRED),
                ticketRepository.findLatestUpdatedAtByConcertId(concertId).orElse(null)
        );
    }

    @Override
    public void markAsUsed(UUID ticketId, OffsetDateTime usedAt) {
        ticketRepository.findById(ticketId).ifPresent(ticket -> {
            ticket.setStatus(Ticket.Status.USED);
            ticket.setUsedAt(usedAt);
            ticketRepository.save(ticket);
        });
    }

    @Override
    public boolean markAsUsedIfValid(UUID ticketId, OffsetDateTime usedAt) {
        return ticketRepository.markAsUsedIfValid(ticketId, usedAt) == 1;
    }

    private TicketView toView(Ticket t) {
        return new TicketView(
                t.getId(),
                t.getConcertId(),
                t.getTicketTypeId(),
                t.getUserId(),
                t.getQrCode(),
                t.getQrSecret(),
                t.getStatus().name(),
                t.getIssuedAt(),
                t.getUsedAt()
        );
    }
}
