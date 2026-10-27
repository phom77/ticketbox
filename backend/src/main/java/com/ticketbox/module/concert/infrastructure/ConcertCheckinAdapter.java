package com.ticketbox.module.concert.infrastructure;

import com.ticketbox.module.concert.CheckinConcertView;
import com.ticketbox.module.concert.ConcertCheckinPort;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ConcertCheckinAdapter implements ConcertCheckinPort {

    private final ConcertRepository concertRepository;

    @Override
    public Page<CheckinConcertView> findByStatus(String status, Pageable pageable) {
        Concert.Status concertStatus = Concert.Status.valueOf(status);
        return concertRepository.findByStatus(concertStatus, pageable).map(this::toView);
    }

    @Override
    public Optional<CheckinConcertView> findById(UUID concertId) {
        return concertRepository.findById(concertId).map(this::toView);
    }

    private CheckinConcertView toView(Concert concert) {
        return new CheckinConcertView(
                concert.getId(),
                concert.getTitle(),
                concert.getVenueName(),
                concert.getVenueAddress(),
                concert.getEventDate(),
                concert.getDoorsOpenAt(),
                concert.getStatus().name(),
                concert.getPosterUrl()
        );
    }
}
