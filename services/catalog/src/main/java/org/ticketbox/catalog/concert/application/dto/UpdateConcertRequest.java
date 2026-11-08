package org.ticketbox.catalog.concert.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;

public record UpdateConcertRequest(
        @NotBlank(message = "{validation.concert.title-required}") String title,
        String description,
        @NotBlank(message = "{validation.concert.venue-name-required}") String venueName,
        @NotBlank(message = "{validation.concert.venue-address-required}") String venueAddress,
        @NotNull(message = "{validation.concert.event-date-required}") OffsetDateTime eventDate,
        OffsetDateTime doorsOpenAt,
        @NotNull(message = "{validation.concert.sale-start-required}") OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        String seatMapSvg) {}
