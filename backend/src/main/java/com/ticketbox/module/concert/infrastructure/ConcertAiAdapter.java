package com.ticketbox.module.concert.infrastructure;

import com.ticketbox.module.concert.ConcertAiPort;
import com.ticketbox.module.concert.application.ConcertService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ConcertAiAdapter implements ConcertAiPort {

    private final ConcertService concertService;

    @Override
    @Transactional
    public void updateArtistBio(UUID concertId, String bio) {
        concertService.updateArtistBio(concertId, bio);
    }
}
