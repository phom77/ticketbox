package org.ticketbox.catalog.concert.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.ticketbox.catalog.concert.domain.ConcertText;

import java.time.OffsetDateTime;
import java.util.Map;

public record UpdateConcertRequest(
        String title,
        String description,
        @NotBlank(message = "{validation.concert.venue-name-required}") String venueName,
        @NotBlank(message = "{validation.concert.venue-address-required}") String venueAddress,
        @NotNull(message = "{validation.concert.event-date-required}") OffsetDateTime eventDate,
        OffsetDateTime doorsOpenAt,
        @NotNull(message = "{validation.concert.sale-start-required}") OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        String seatMapSvg,
        ConcertText original,
        Map<String, ConcertText> translations) {}
