package com.ticketbox.module.concert;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Optional;
import java.util.UUID;

public interface ConcertCheckinPort {

    Page<CheckinConcertView> findByStatus(String status, Pageable pageable);

    Optional<CheckinConcertView> findById(UUID concertId);
}
